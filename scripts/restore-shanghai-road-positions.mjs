import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [originalPath, compactPath, outputPath] = process.argv.slice(2)
if (!originalPath || !compactPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/restore-shanghai-road-positions.mjs ' +
    '<original.glb> <compact.glb> <output.glb>',
  )
}

const modules = join(homedir(), '.npm/_npx/a6797f7ff67bb1f2/node_modules')
const paths = {
  core: join(modules, '@gltf-transform/core/dist/index.js'),
  extensions: join(modules, '@gltf-transform/extensions/dist/index.js'),
  meshoptimizer: join(modules, 'meshoptimizer/index.js'),
}
for (const path of Object.values(paths)) {
  if (!existsSync(path)) throw new Error(`Missing cached GLB tool: ${path}`)
}

const { NodeIO } = await import(pathToFileURL(paths.core).href)
const { ALL_EXTENSIONS } = await import(pathToFileURL(paths.extensions).href)
const { MeshoptDecoder, MeshoptEncoder } = await import(pathToFileURL(paths.meshoptimizer).href)
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready])

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })
const original = await io.read(originalPath)
const compact = await io.read(compactPath)
const originalPrimitives = original.getRoot().listMeshes()[0]?.listPrimitives() ?? []
const compactPrimitives = compact.getRoot().listMeshes()[0]?.listPrimitives() ?? []
if (originalPrimitives.length !== compactPrimitives.length) {
  throw new Error('Original and compact maps do not have matching primitive layouts')
}

const driveMaterials = new Set([
  'tarmac', '14', '15', 'Pit_lane', 'Out', 'Prato', '28', '35', '32',
  '17', '16', '13', '9!0', '12', '10', 'Pirelli_terra', 'Petronas_out',
  'Out_rolex', '2!0', '24', '22', '23', '20', '21', 'Kerb_giallo',
  'RUG_blu', 'Spec_glill',
])
const CELL_SIZE = 4
const MAX_RAW_DISTANCE_SQ = 36
const cellKey = (x, y, z) =>
  `${Math.floor(x / CELL_SIZE)}:${Math.floor(y / CELL_SIZE)}:${Math.floor(z / CELL_SIZE)}`

let restoredPrimitives = 0
let restoredVertices = 0
let unmatchedVertices = 0
let maxRawCorrection = 0

for (let primitiveIndex = 0; primitiveIndex < originalPrimitives.length; primitiveIndex += 1) {
  const sourcePrimitive = originalPrimitives[primitiveIndex]
  const targetPrimitive = compactPrimitives[primitiveIndex]
  const sourceMaterialName = sourcePrimitive.getMaterial()?.getName() ?? ''
  const targetMaterialName = targetPrimitive.getMaterial()?.getName() ?? ''
  if (!driveMaterials.has(sourceMaterialName) || sourceMaterialName !== targetMaterialName) continue

  const sourceAccessor = sourcePrimitive.getAttribute('POSITION')
  const targetAccessor = targetPrimitive.getAttribute('POSITION')
  const source = sourceAccessor?.getArray()
  const target = targetAccessor?.getArray()
  if (!source || !target || sourceAccessor.getElementSize() !== 3 || targetAccessor.getElementSize() !== 3) {
    continue
  }

  const cells = new Map()
  for (let index = 0; index < source.length; index += 3) {
    const key = cellKey(source[index], source[index + 1], source[index + 2])
    const entries = cells.get(key)
    if (entries) entries.push(index)
    else cells.set(key, [index])
  }

  for (let index = 0; index < target.length; index += 3) {
    const x = target[index]
    const y = target[index + 1]
    const z = target[index + 2]
    const cx = Math.floor(x / CELL_SIZE)
    const cy = Math.floor(y / CELL_SIZE)
    const cz = Math.floor(z / CELL_SIZE)
    let bestSourceIndex = -1
    let bestDistanceSq = Number.POSITIVE_INFINITY

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const entries = cells.get(`${cx + dx}:${cy + dy}:${cz + dz}`)
          if (!entries) continue
          for (const sourceIndex of entries) {
            const sx = source[sourceIndex] - x
            const sy = source[sourceIndex + 1] - y
            const sz = source[sourceIndex + 2] - z
            const distanceSq = sx * sx + sy * sy + sz * sz
            if (distanceSq < bestDistanceSq) {
              bestDistanceSq = distanceSq
              bestSourceIndex = sourceIndex
            }
          }
        }
      }
    }

    if (bestSourceIndex < 0 || bestDistanceSq > MAX_RAW_DISTANCE_SQ) {
      unmatchedVertices += 1
      continue
    }
    target[index] = source[bestSourceIndex]
    target[index + 1] = source[bestSourceIndex + 1]
    target[index + 2] = source[bestSourceIndex + 2]
    restoredVertices += 1
    maxRawCorrection = Math.max(maxRawCorrection, Math.sqrt(bestDistanceSq))
  }
  targetAccessor.setArray(target)
  restoredPrimitives += 1
}

if (unmatchedVertices > 0) {
  throw new Error(`Could not match ${unmatchedVertices} compact road vertices to original positions`)
}
await io.write(outputPath, compact)
console.log(
  `Restored ${restoredVertices} road vertex positions across ${restoredPrimitives} primitives; ` +
  `maximum raw correction ${maxRawCorrection.toFixed(3)}`,
)

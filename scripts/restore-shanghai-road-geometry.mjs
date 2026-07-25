import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [originalPath, compactPath, outputPath] = process.argv.slice(2)
if (!originalPath || !compactPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/restore-shanghai-road-geometry.mjs ' +
    '<original.glb> <compact.glb> <output.glb>',
  )
}

const modules = join(homedir(), '.npm/_npx/a6797f7ff67bb1f2/node_modules')
const paths = {
  core: join(modules, '@gltf-transform/core/dist/index.js'),
  extensions: join(modules, '@gltf-transform/extensions/dist/index.js'),
  functions: join(modules, '@gltf-transform/functions/dist/index.js'),
  meshoptimizer: join(modules, 'meshoptimizer/index.js'),
}
for (const path of Object.values(paths)) {
  if (!existsSync(path)) throw new Error(`Missing cached GLB tool: ${path}`)
}

const { NodeIO } = await import(pathToFileURL(paths.core).href)
const { ALL_EXTENSIONS } = await import(pathToFileURL(paths.extensions).href)
const { prune } = await import(pathToFileURL(paths.functions).href)
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

const cloneAccessor = (source) => {
  const sourceArray = source.getArray()
  const array = sourceArray.slice()
  return compact.createAccessor(source.getName())
    .setType(source.getType())
    .setArray(array)
    .setNormalized(source.getNormalized())
}

let restoredPrimitives = 0
let restoredTriangles = 0
for (let index = 0; index < originalPrimitives.length; index += 1) {
  const source = originalPrimitives[index]
  const target = compactPrimitives[index]
  const sourceMaterialName = source.getMaterial()?.getName() ?? ''
  const targetMaterialName = target.getMaterial()?.getName() ?? ''
  if (!driveMaterials.has(sourceMaterialName) || sourceMaterialName !== targetMaterialName) continue

  const indices = source.getIndices()
  if (!indices) continue
  target.setIndices(cloneAccessor(indices))
  for (const semantic of target.listSemantics()) target.setAttribute(semantic, null)
  for (const semantic of source.listSemantics()) {
    const accessor = source.getAttribute(semantic)
    if (accessor) target.setAttribute(semantic, cloneAccessor(accessor))
  }
  restoredPrimitives += 1
  restoredTriangles += indices.getCount() / 3
}

await compact.transform(prune({
  keepLeaves: true,
  keepAttributes: true,
  keepSolidTextures: true,
  keepExtras: true,
}))
await io.write(outputPath, compact)
console.log(
  `Restored ${restoredPrimitives} original road primitives ` +
  `(${restoredTriangles} triangles) without re-quantizing their vertices`,
)

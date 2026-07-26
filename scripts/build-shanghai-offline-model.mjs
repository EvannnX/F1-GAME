import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'

const root = process.cwd()
const cacheRoot = join(homedir(), '.npm/_npx/a6797f7ff67bb1f2/node_modules')
const corePath = join(cacheRoot, '@gltf-transform/core/dist/index.js')
const extensionsPath = join(cacheRoot, '@gltf-transform/extensions/dist/index.js')
const functionsPath = join(cacheRoot, '@gltf-transform/functions/dist/index.js')
const meshoptimizerPath = join(cacheRoot, 'meshoptimizer/index.js')

for (const path of [corePath, extensionsPath, functionsPath, meshoptimizerPath]) {
  if (!existsSync(path)) throw new Error(`Missing cached GLB tool: ${path}`)
}

const { NodeIO } = await import(pathToFileURL(corePath).href)
const { ALL_EXTENSIONS } = await import(pathToFileURL(extensionsPath).href)
const { compactPrimitive, dequantizePrimitive } = await import(pathToFileURL(functionsPath).href)
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = await import(
  pathToFileURL(meshoptimizerPath).href
)

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])

const input = join(
  root,
  'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb',
)
const output = process.argv[2] ?? join(root, 'artifacts/shanghai-full-outline.glb')
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })
const document = await io.read(input)

const targetRatios = new Map([
  ['Nuove_Barriere', 0.05],
  ['wirefence_pole_d', 0.1],
])
const changes = []

for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const materialName = primitive.getMaterial()?.getName() ?? ''
    const ratio = targetRatios.get(materialName)
    if (ratio === undefined) continue
    const before = primitive.getIndices()?.getCount() ?? 0
    dequantizePrimitive(primitive)
    const position = primitive.getAttribute('POSITION')?.getArray()
    const sourceIndices = primitive.getIndices()?.getArray()
    if (!(position instanceof Float32Array) || !sourceIndices) {
      throw new Error(`Cannot simplify ${materialName}: unsupported vertex data`)
    }
    const indices = sourceIndices instanceof Uint32Array
      ? sourceIndices
      : new Uint32Array(sourceIndices)
    const targetCount = Math.floor(indices.length * ratio / 3) * 3
    const [simplifiedIndices] = MeshoptSimplifier.simplify(
      indices,
      position,
      3,
      targetCount,
      1,
      ['Permissive'],
    )
    primitive.getIndices().setArray(simplifiedIndices)
    compactPrimitive(primitive)
    const after = primitive.getIndices()?.getCount() ?? 0
    changes.push({ materialName, before: before / 3, after: after / 3 })
  }
}

if (changes.length !== targetRatios.size) {
  throw new Error(`Expected ${targetRatios.size} dense scene groups, found ${changes.length}`)
}

await io.write(output, document)
console.log(JSON.stringify({ output, changes }, null, 2))

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const output = process.argv[2] ?? join(root, 'artifacts/redbull-body-simplified.glb')
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
const { compactPrimitive, dequantizePrimitive } = await import(pathToFileURL(paths.functions).href)
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = await import(
  pathToFileURL(paths.meshoptimizer).href
)
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])

const protectedMaterials = new Set([
  'front_rims',
  'rear_rims',
  'material_105',
  'material_97',
  'material_102',
  'flasks',
  'brakes_in',
  'baked_fix_roue',
  'suspensions',
])
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })
const document = await io.read(join(root, 'src/assets/models/RB19_REDBULL.opt.glb'))
let protectedTriangles = 0
let bodyTrianglesBefore = 0
let bodyTrianglesAfter = 0

for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const materialName = (primitive.getMaterial()?.getName() ?? '').toLowerCase()
    const before = (primitive.getIndices()?.getCount() ?? 0) / 3
    if (protectedMaterials.has(materialName)) {
      protectedTriangles += before
      continue
    }

    dequantizePrimitive(primitive)
    const position = primitive.getAttribute('POSITION')?.getArray()
    const sourceIndices = primitive.getIndices()?.getArray()
    if (!(position instanceof Float32Array) || !sourceIndices) continue
    const indices = sourceIndices instanceof Uint32Array
      ? sourceIndices
      : new Uint32Array(sourceIndices)
    const targetCount = Math.floor(indices.length * 0.08 / 3) * 3
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
    bodyTrianglesBefore += before
    bodyTrianglesAfter += simplifiedIndices.length / 3
  }
}

await io.write(output, document)
console.log(JSON.stringify({
  output,
  protectedTriangles,
  bodyTrianglesBefore,
  bodyTrianglesAfter,
}, null, 2))

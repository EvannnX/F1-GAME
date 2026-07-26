import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  throw new Error('Usage: node scripts/normalize-shanghai-uv.mjs <input.glb> <output.glb>')
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
const { ALL_EXTENSIONS, KHRTextureTransform } = await import(pathToFileURL(paths.extensions).href)
const { listTextureInfoByMaterial, prune } = await import(pathToFileURL(paths.functions).href)
const { MeshoptDecoder, MeshoptEncoder } = await import(pathToFileURL(paths.meshoptimizer).href)
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready])

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })
const document = await io.read(input)
const transformExtension = document.createExtension(KHRTextureTransform).setRequired(true)
const primitivesByMaterial = new Map()

for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial()
    if (!material || !primitive.getAttribute('TEXCOORD_0')) continue
    const list = primitivesByMaterial.get(material)
    if (list) list.push(primitive)
    else primitivesByMaterial.set(material, [primitive])
  }
}

let quantizedAccessors = 0
for (const [material, primitives] of primitivesByMaterial) {
  const textureInfos = listTextureInfoByMaterial(material)
    .filter((info) => info.getTexCoord() === 0)
  if (textureInfos.length === 0) continue

  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  const value = [0, 0]
  for (const primitive of primitives) {
    const uv = primitive.getAttribute('TEXCOORD_0')
    for (let index = 0; index < uv.getCount(); index += 1) {
      uv.getElement(index, value)
      minU = Math.min(minU, value[0])
      minV = Math.min(minV, value[1])
      maxU = Math.max(maxU, value[0])
      maxV = Math.max(maxV, value[1])
    }
  }
  const rangeU = Math.max(1e-8, maxU - minU)
  const rangeV = Math.max(1e-8, maxV - minV)

  for (const primitive of primitives) {
    const source = primitive.getAttribute('TEXCOORD_0')
    const values = new Uint16Array(source.getCount() * 2)
    for (let index = 0; index < source.getCount(); index += 1) {
      source.getElement(index, value)
      values[index * 2] = Math.round((value[0] - minU) / rangeU * 65535)
      values[index * 2 + 1] = Math.round((value[1] - minV) / rangeV * 65535)
    }
    const accessor = document.createAccessor(source.getName())
      .setType('VEC2')
      .setArray(values)
      .setNormalized(true)
    primitive.setAttribute('TEXCOORD_0', accessor)
    quantizedAccessors += 1
  }

  for (const info of textureInfos) {
    info.setExtension(
      'KHR_texture_transform',
      transformExtension.createTransform()
        .setOffset([minU, minV])
        .setScale([rangeU, rangeV]),
    )
  }
}

await document.transform(prune({
  keepLeaves: true,
  keepAttributes: true,
  keepSolidTextures: true,
  keepExtras: true,
}))
await io.write(output, document)
console.log(`Normalized ${quantizedAccessors} UV accessors without changing indices`)

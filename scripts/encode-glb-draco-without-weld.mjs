import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  throw new Error('Usage: node scripts/encode-glb-draco-without-weld.mjs <input.glb> <output.glb>')
}

const modules = join(homedir(), '.npm/_npx/a6797f7ff67bb1f2/node_modules')
const paths = {
  core: join(modules, '@gltf-transform/core/dist/index.js'),
  extensions: join(modules, '@gltf-transform/extensions/dist/index.js'),
  meshoptimizer: join(modules, 'meshoptimizer/index.js'),
  draco: join(modules, 'draco3dgltf/draco3dgltf.js'),
}
for (const path of Object.values(paths)) {
  if (!existsSync(path)) throw new Error(`Missing cached GLB tool: ${path}`)
}

const { NodeIO } = await import(pathToFileURL(paths.core).href)
const {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
  KHRDracoMeshCompression,
} = await import(pathToFileURL(paths.extensions).href)
const { MeshoptDecoder } = await import(pathToFileURL(paths.meshoptimizer).href)
const draco3dModule = await import(pathToFileURL(paths.draco).href)
const draco3d = draco3dModule.default
const [dracoDecoder, dracoEncoder] = await Promise.all([
  draco3d.createDecoderModule(),
  draco3d.createEncoderModule(),
])
await MeshoptDecoder.ready

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'draco3d.decoder': dracoDecoder,
    'draco3d.encoder': dracoEncoder,
  })
const document = await io.read(input)
document.getRoot().listExtensionsUsed()
  .find((extension) => extension instanceof EXTMeshoptCompression)
  ?.dispose()
document.createExtension(KHRDracoMeshCompression)
  .setRequired(true)
  .setEncoderOptions({
    method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
    encodeSpeed: 5,
    decodeSpeed: 5,
    quantizationBits: {
      POSITION: 14,
      NORMAL: 10,
      COLOR: 8,
      TEX_COORD: 12,
      GENERIC: 12,
    },
    quantizationVolume: 'mesh',
  })
await io.write(output, document)
console.log(`Draco encoded without welding: ${output}`)

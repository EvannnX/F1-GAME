import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const npxRoot = join(homedir(), '.npm/_npx')
const projectModules = join(root, 'node_modules')
const cachedModules = existsSync(npxRoot)
  ? readdirSync(npxRoot)
      .map((entry) => join(npxRoot, entry, 'node_modules'))
      .find((directory) =>
        existsSync(join(directory, '@gltf-transform/core/dist/index.js'))
        && existsSync(join(directory, 'draco3dgltf/draco3dgltf.js')),
      )
  : undefined
const modules = existsSync(join(projectModules, '@gltf-transform/core/dist/index.js'))
  && existsSync(join(projectModules, 'draco3dgltf/draco3dgltf.js'))
  ? projectModules
  : cachedModules

if (!modules) {
  throw new Error('Cached glTF Transform and Draco decoder packages are required')
}

const core = await import(pathToFileURL(join(modules, '@gltf-transform/core/dist/index.js')).href)
const extensions = await import(pathToFileURL(join(modules, '@gltf-transform/extensions/dist/index.js')).href)
const dracoModule = await import(pathToFileURL(join(modules, 'draco3dgltf/draco3dgltf.js')).href)
const dracoDecoder = await dracoModule.default.createDecoderModule()

const io = new core.NodeIO()
  .registerExtensions(extensions.ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': dracoDecoder })

const input = resolve(root, '.compact30-assets/fom-player.glb')
const outputDirectory = resolve(root, '.host-safe-assets')
const output = resolve(outputDirectory, 'fom-compatible.glb')
mkdirSync(outputDirectory, { recursive: true })

const document = await io.read(input)
for (const extension of document.getRoot().listExtensionsUsed()) {
  if (extension instanceof extensions.KHRDracoMeshCompression) extension.dispose()
}
for (const texture of document.getRoot().listTextures()) texture.dispose()
await io.write(output, document)

const verified = await io.read(output)
const required = verified.getRoot().listExtensionsRequired().map((extension) => extension.extensionName)
if (required.includes('KHR_draco_mesh_compression')) {
  throw new Error('Host-safe car still requires Draco decompression')
}
const textures = verified.getRoot().listTextures()
if (textures.length > 0) {
  throw new Error(`Host-safe car still contains ${textures.length} texture assets`)
}

console.log(
  `Prepared decoder-free host car: ${statSync(output).size.toLocaleString('en-US')} bytes, `
  + `required extensions: ${required.join(', ') || 'none'}, textures: ${textures.length}.`,
)

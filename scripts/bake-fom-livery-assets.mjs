import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const packageRoot = join(root, 'src/assets/FOM赛车涂装贴花可复用包-v54')
const rearSourcePath = join(packageRoot, 'ChatGPT Image Jul 26, 2026, 02_07_44 AM.png')
const generatedRoot = join(root, 'src/generated/fom')
const geometryPath = join(generatedRoot, 'decal-geometries.json')
const rearOutputPath = join(generatedRoot, 'rear-logo-white.png')

if (!existsSync(geometryPath)) {
  throw new Error(
    'Missing original v54 geometry. Run scripts/extract-fom-v54-browser.mjs '
    + 'against the original preview before baking textures.',
  )
}

const npxRoot = join(homedir(), '.npm/_npx')
const cacheRoots = existsSync(npxRoot)
  ? readdirSync(npxRoot).map((entry) => join(npxRoot, entry, 'node_modules'))
  : []
const modules = cacheRoots.find((directory) =>
  existsSync(join(directory, 'sharp/lib/index.js')),
)
if (!modules) throw new Error('Cached Sharp package was not found')

const sharpModule = await import(pathToFileURL(join(modules, 'sharp/lib/index.js')).href)
const sharp = sharpModule.default
const { data, info } = await sharp(rearSourcePath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

// v54 createWhiteTextureFromSourceAlpha preserves alpha and forces white RGB.
for (let offset = 0; offset < data.length; offset += 4) {
  data[offset] = 255
  data[offset + 1] = 255
  data[offset + 2] = 255
}

mkdirSync(dirname(rearOutputPath), { recursive: true })
await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toFile(rearOutputPath)
console.log(`Kept original v54 browser geometry: ${geometryPath}`)
console.log(`Baked v54 white rear logo: ${rearOutputPath}`)

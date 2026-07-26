import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir } from 'node:os'

const root = process.cwd()
const scriptPath = fileURLToPath(import.meta.url)
const output = join(root, '.offline8m-assets')
const runtime = join(output, 'runtime')
mkdirSync(output, { recursive: true })
mkdirSync(runtime, { recursive: true })

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`)
}

function findCachedGltfTransformCli() {
  const npxRoot = join(homedir(), '.npm/_npx')
  if (!existsSync(npxRoot)) return null
  for (const cacheKey of readdirSync(npxRoot)) {
    const candidate = join(npxRoot, cacheKey, 'node_modules/@gltf-transform/cli/bin/cli.js')
    if (existsSync(candidate)) return candidate
  }
  return null
}

const cachedGltfTransformCli = findCachedGltfTransformCli()
const cachedNodeModules = cachedGltfTransformCli
  ? join(cachedGltfTransformCli, '../../../..')
  : null
function runGltfTransform(args) {
  if (cachedGltfTransformCli) {
    run(process.execPath, [cachedGltfTransformCli, ...args])
    return
  }
  run('npx', ['--yes', '@gltf-transform/cli', ...args])
}

function needsUpdate(source, destination) {
  return !existsSync(destination) ||
    statSync(destination).mtimeMs < statSync(source).mtimeMs ||
    statSync(destination).mtimeMs < statSync(scriptPath).mtimeMs
}

function optimizeGlb(sourcePath, outputName, ratio, textureSize) {
  const source = join(root, sourcePath)
  const destination = join(output, outputName)
  if (!needsUpdate(source, destination)) return
  runGltfTransform([
    'optimize', source, destination,
    '--compress', 'meshopt', '--meshopt-level', 'high',
    '--flatten', sourcePath.includes('shanghai_') ? 'true' : 'false',
    '--instance', 'false', '--join', sourcePath.includes('shanghai_') ? 'true' : 'false',
    '--palette', sourcePath.includes('shanghai_') ? 'true' : 'false',
    '--simplify', 'true', '--simplify-ratio', String(ratio),
    '--simplify-error', sourcePath.includes('shanghai_') ? '0.08' : '0.06',
    '--simplify-lock-border', 'false', '--texture-compress', 'webp',
    '--texture-size', String(textureSize),
  ])
}

async function prepareRedBullMobileModel() {
  const source = join(root, 'src/assets/models/RB19_REDBULL.opt.glb')
  const destination = join(output, 'redbull-mobile.glb')
  if (!needsUpdate(source, destination)) return
  if (!cachedNodeModules) throw new Error('Cached image tools are required to prepare Red Bull textures')
  const sharpModule = await import(pathToFileURL(join(cachedNodeModules, 'sharp/lib/index.js')).href)
  const sharp = sharpModule.default
  const glb = readFileSync(source)
  const jsonLength = glb.readUInt32LE(12)
  const binHeaderOffset = 20 + jsonLength
  const binLength = glb.readUInt32LE(binHeaderOffset)
  const document = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength).trim())
  const bin = Buffer.from(glb.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength))
  let resized = 0

  for (const image of document.images ?? []) {
    if (image.mimeType !== 'image/webp' || image.bufferView === undefined) continue
    const view = document.bufferViews[image.bufferView]
    const offset = view.byteOffset ?? 0
    const sourceImage = bin.subarray(offset, offset + view.byteLength)
    const metadata = await sharp(sourceImage).metadata()
    if ((metadata.width ?? 0) <= 96 && (metadata.height ?? 0) <= 96) continue
    const mobileImage = await sharp(sourceImage)
      .resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70, effort: 6 })
      .toBuffer()
    if (mobileImage.length >= view.byteLength) continue
    mobileImage.copy(bin, offset)
    bin.fill(0, offset + mobileImage.length, offset + view.byteLength)
    view.byteLength = mobileImage.length
    resized += 1
  }

  const json = Buffer.from(JSON.stringify(document))
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
  const result = Buffer.alloc(12 + 8 + paddedJson.length + 8 + bin.length)
  result.write('glTF', 0, 'ascii')
  result.writeUInt32LE(2, 4)
  result.writeUInt32LE(result.length, 8)
  result.writeUInt32LE(paddedJson.length, 12)
  result.writeUInt32LE(0x4e4f534a, 16)
  paddedJson.copy(result, 20)
  const resultBinOffset = 20 + paddedJson.length
  result.writeUInt32LE(bin.length, resultBinOffset)
  result.writeUInt32LE(0x004e4942, resultBinOffset + 4)
  bin.copy(result, resultBinOffset + 8)
  writeFileSync(destination, result)
  console.log(`Prepared Red Bull: exact geometry with ${resized} mobile textures`)
}

function prepareOfflineDracoDecoder() {
  const source = join(root, 'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js')
  const destination = join(output, 'draco-decoder.js')
  if (needsUpdate(source, destination)) {
    const decoder = readFileSync(source, 'utf8')
      .replaceAll('XMLHttpRequest', 'F1TINetworkDisabledRequest')
      .replace(/\bfetch\b/g, 'F1TINetworkDisabledFetch')
      .replaceAll('self.location.href', '""')
    writeFileSync(destination, decoder)
  }
  const stub = join(output, 'draco-decoder-stub.js')
  if (!existsSync(stub) || statSync(stub).mtimeMs < statSync(scriptPath).mtimeMs) {
    writeFileSync(stub, '')
  }
}

async function prepareShanghaiOptimizedModel() {
  const source = join(root, 'src/assets/shanghai_mobile-road-safe.glb')
  const destination = join(output, 'shanghai-mobile.glb')
  if (!needsUpdate(source, destination)) return
  if (!cachedNodeModules) throw new Error('Cached image tools are required to prepare Shanghai textures')
  const sharpModule = await import(pathToFileURL(join(cachedNodeModules, 'sharp/lib/index.js')).href)
  const sharp = sharpModule.default
  const glb = readFileSync(source)
  const jsonLength = glb.readUInt32LE(12)
  const binHeaderOffset = 20 + jsonLength
  const binLength = glb.readUInt32LE(binHeaderOffset)
  const document = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength).trim())
  const geometryGroups = (document.meshes ?? []).reduce(
    (total, mesh) => total + (mesh.primitives?.length ?? 0),
    0,
  )
  const bin = Buffer.from(glb.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength))
  let recompressed = 0

  for (const image of document.images ?? []) {
    if (image.mimeType !== 'image/webp' || image.bufferView === undefined) continue
    const view = document.bufferViews[image.bufferView]
    const offset = view.byteOffset ?? 0
    const sourceImage = bin.subarray(offset, offset + view.byteLength)
    const mobileImage = await sharp(sourceImage).webp({ quality: 5, effort: 6 }).toBuffer()
    if (mobileImage.length >= view.byteLength) continue
    mobileImage.copy(bin, offset)
    bin.fill(0, offset + mobileImage.length, offset + view.byteLength)
    view.byteLength = mobileImage.length
    recompressed += 1
  }

  const json = Buffer.from(JSON.stringify(document))
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
  const result = Buffer.alloc(12 + 8 + paddedJson.length + 8 + bin.length)
  result.write('glTF', 0, 'ascii')
  result.writeUInt32LE(2, 4)
  result.writeUInt32LE(result.length, 8)
  result.writeUInt32LE(paddedJson.length, 12)
  result.writeUInt32LE(0x4e4f534a, 16)
  paddedJson.copy(result, 20)
  const resultBinOffset = 20 + paddedJson.length
  result.writeUInt32LE(bin.length, resultBinOffset)
  result.writeUInt32LE(0x004e4942, resultBinOffset + 4)
  bin.copy(result, resultBinOffset + 8)
  writeFileSync(destination, result)
  console.log(
    `Prepared Shanghai map: ${geometryGroups} geometry groups preserved; ` +
      `${recompressed} textures recompressed`,
  )
}

function ffmpeg(source, destination, args) {
  if (!needsUpdate(source, destination)) return
  mkdirSync(join(destination, '..'), { recursive: true })
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, ...args, destination])
}

await prepareShanghaiOptimizedModel()
prepareOfflineDracoDecoder()
await prepareRedBullMobileModel()
optimizeGlb('src/assets/models/Ferrari_26.opt.glb', 'ferrari-mobile.glb', 0.002, 16)
optimizeGlb('src/assets/models/Mercedes_W13.glb', 'mercedes-mobile.glb', 0.002, 16)
optimizeGlb('src/assets/models/McLaren_MCL35M.opt.glb', 'mclaren-mobile.glb', 0.002, 16)

ffmpeg(
  join(root, 'src/assets/background/Cloudymorning2k.hdr'),
  join(output, 'sky-mobile.hdr'),
  ['-vf', 'scale=64:32'],
)
ffmpeg(
  join(root, 'src/assets/audio/engine.mp3'),
  join(output, 'engine-mobile.mp3'),
  ['-ac', '1', '-ar', '16000', '-b:a', '16k'],
)
ffmpeg(
  join(
    root,
    'src/assets/audio/Don Toliver - Lose My Mind (feat. Doja Cat) [From F1® The Movie] [Official Audio].mp3',
  ),
  join(output, 'bgm-mobile.mp3'),
  ['-t', '30', '-ac', '1', '-ar', '22050', '-b:a', '16k'],
)

ffmpeg(
  join(root, 'src/f1ti/首页背景.gif'),
  join(output, 'home-mobile.gif'),
  [
    '-filter_complex',
    '[0:v]fps=8,scale=240:-2:flags=lanczos,split[s0][s1];' +
      '[s0]palettegen=max_colors=64:stats_mode=diff[p];' +
      '[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop',
    '0',
  ],
)
ffmpeg(
  join(root, 'public/video/beginning.mp4'),
  join(runtime, 'video/beginning.mp4'),
  ['-an', '-vf', 'scale=280:-2:flags=lanczos,fps=10', '-c:v', 'libx264', '-preset', 'slow', '-crf', '39', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
)

const portraits = [
  ['KimiAntonelli.png', 'portrait-antonelli.png'],
  ['LouisHamilton.png', 'portrait-hamilton.png'],
  ['MaxVerstappen.png', 'portrait-verstappen.png'],
]
for (const [sourceName, outputName] of portraits) {
  ffmpeg(
    join(root, 'F1-卡通图', sourceName),
    join(output, outputName),
    ['-vf', "scale='min(80,iw)':-2:flags=lanczos", '-frames:v', '1'],
  )
}

ffmpeg(
  join(root, 'src/assets/textures/shanghai_environment.webp'),
  join(output, 'track-mobile.jpg'),
  ['-vf', "scale='min(256,iw)':-2:flags=lanczos", '-frames:v', '1', '-q:v', '9'],
)

const textureSources = [
  ['asphalt-new.png', 'asphalt.jpg', 256],
  ['Meshesgrassxgrass0171_diff_18.png', 'grass.jpg', 256],
  ['PAT_asf_out_123.png', 'paddock.jpg', 128],
]
for (const [sourceName, outputName, textureSize] of textureSources) {
  ffmpeg(
    join(root, 'src/shanghai-international-circuit-2018-layout/textures', sourceName),
    join(runtime, 'offline/textures', outputName),
    ['-vf', `scale='min(${textureSize},iw)':'min(${textureSize},ih)':force_original_aspect_ratio=decrease:flags=lanczos`, '-frames:v', '1', '-q:v', '5'],
  )
}

const commentaryOutput = join(runtime, 'audio/commentary')
rmSync(commentaryOutput, { recursive: true, force: true })
mkdirSync(join(runtime, 'audio'), { recursive: true })

mkdirSync(join(runtime, 'offline'), { recursive: true })
rmSync(join(runtime, 'offline/shanghai-mobile.glb'), { force: true })
rmSync(join(runtime, 'offline/shanghai-mobile.glb.gz'), { force: true })
rmSync(join(runtime, 'offline/shanghai-mobile-v4.glb.gz'), { force: true })
rmSync(join(runtime, 'offline/shanghai-mobile-v5.glb'), { force: true })
rmSync(join(runtime, 'offline/shanghai-mobile-v8.glb'), { force: true })
cpSync(join(root, 'public/fibi.webp'), join(runtime, 'fibi.webp'))
console.log('Prepared offline 8 MB assets.')

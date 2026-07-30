import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const output = join(root, '.compact30-assets')
const runtime = join(output, 'runtime')
mkdirSync(output, { recursive: true })
mkdirSync(runtime, { recursive: true })

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`)
}

function needsUpdate(source, destination) {
  return !existsSync(destination) || statSync(destination).mtimeMs < statSync(source).mtimeMs
}

function findSharpModule() {
  const npxRoot = join(homedir(), '.npm/_npx')
  if (!existsSync(npxRoot)) return null
  for (const cacheKey of readdirSync(npxRoot)) {
    const candidate = join(npxRoot, cacheKey, 'node_modules/sharp/lib/index.js')
    if (existsSync(candidate)) return candidate
  }
  return null
}

function copyGlbUnchanged(sourceRelative, outputName) {
  const source = join(root, sourceRelative)
  const destination = join(output, outputName)
  cpSync(source, destination)
}

function ffmpeg(source, destination, args) {
  if (!needsUpdate(source, destination)) return
  mkdirSync(dirname(destination), { recursive: true })
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, ...args, destination])
}

// Keep the exact desktop map. Previous compact attempts preserved triangle
// counts but changed quantized vertex attributes, which was still visible.
cpSync(
  join(root, 'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb'),
  join(output, 'shanghai-compact.glb'),
)

copyGlbUnchanged(
  'src/assets/已压缩车模型/2022_ferrari_f1-75 (1)-optimized 2.glb',
  'ferrari-player.glb',
)
copyGlbUnchanged(
  'src/assets/已压缩车模型/amg_f1_w15_2024__www.vecarz.com-optimized 2.glb',
  'mercedes-player.glb',
)
copyGlbUnchanged('src/assets/models/RB19_REDBULL.opt.glb', 'redbull-player.glb')
copyGlbUnchanged(
  'src/assets/FOM赛车涂装贴花可复用包-v54/f1_2026_fom-nyu-purple-color-only.glb',
  'fom-player.glb',
)
copyGlbUnchanged('src/assets/models/Ferrari_26.opt.glb', 'ferrari-opponent.glb')
copyGlbUnchanged('src/assets/models/Mercedes_W13.glb', 'mercedes-opponent.glb')

ffmpeg(
  join(root, 'src/assets/background/Cloudymorning2k.hdr'),
  join(output, 'sky-compact.hdr'),
  ['-vf', 'scale=1024:512:flags=lanczos'],
)
ffmpeg(
  join(root, 'src/assets/audio/engine.mp3'),
  join(output, 'engine-compact.mp3'),
  ['-ac', '1', '-ar', '22050', '-b:a', '64k'],
)
ffmpeg(
  join(
    root,
    'src/assets/audio/Don Toliver - Lose My Mind (feat. Doja Cat) [From F1® The Movie] [Official Audio].mp3',
  ),
  join(output, 'bgm-compact.mp3'),
  ['-ac', '2', '-ar', '44100', '-b:a', '96k'],
)

cpSync(join(root, 'src/f1ti/首页背景.gif'), join(output, 'home-compact.gif'))

for (const [sourceName, outputName] of [
  ['KimiAntonelli.png', 'portrait-antonelli.png'],
  ['LouisHamilton.png', 'portrait-hamilton.png'],
  ['MaxVerstappen.png', 'portrait-verstappen.png'],
]) {
  cpSync(join(root, 'F1-卡通图', sourceName), join(output, outputName))
}

for (const sourceName of [
  'asphalt-new.png',
  'Meshesgrassxgrass0171_diff_18.png',
  'PAT_asf_out_123.png',
]) {
  const destination = join(runtime, 'offline/textures', sourceName)
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(
    join(root, 'src/shanghai-international-circuit-2018-layout/textures', sourceName),
    destination,
  )
}

const sharpModulePath = findSharpModule()
mkdirSync(join(runtime, 'track-textures'), { recursive: true })
const compactTrackTextures = [
  ['asphalt-new.png', 'asphalt.webp'],
  ['Meshesgrassxgrass0171_diff_18.png', 'grass.webp'],
  ['PAT_asf_out_123.png', 'paddock.webp'],
]
if (sharpModulePath) {
  const sharp = (await import(pathToFileURL(sharpModulePath).href)).default
  for (const [sourceName, outputName] of compactTrackTextures) {
    await sharp(join(root, 'src/shanghai-international-circuit-2018-layout/textures', sourceName))
      .webp({
        quality: 88,
        alphaQuality: 100,
        smartSubsample: true,
        effort: 6,
      })
      .toFile(join(runtime, 'track-textures', outputName))
  }
} else {
  for (const [, outputName] of compactTrackTextures) {
    const destination = join(runtime, 'track-textures', outputName)
    if (!existsSync(destination)) {
      throw new Error(`A cached sharp installation or existing ${outputName} is required`)
    }
  }
  console.warn('Sharp unavailable; reused existing compact track textures.')
}

mkdirSync(join(runtime, 'video'), { recursive: true })
cpSync(join(root, 'public/video/beginning.mp4'), join(runtime, 'video/beginning.mp4'))
cpSync(join(root, 'public/fibi.webp'), join(runtime, 'fibi.webp'))
rmSync(join(runtime, 'audio'), { recursive: true, force: true })

console.log('Prepared compact30 assets without race commentary.')

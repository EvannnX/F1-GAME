import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()
const dist = join(root, process.env.F1TI_COMPACT_OUT_DIR ?? 'dist-compact30')
const runtime = join(root, '.compact30-assets/runtime')
const skipTrackOverrides = process.env.F1TI_SKIP_TRACK_OVERRIDES === '1'
const useCompressedTrackTextures = process.env.F1TI_COMPRESSED_TRACK_TEXTURES === '1'

const runtimePaths = useCompressedTrackTextures
  ? ['track-textures', 'video', 'fibi.webp']
  : skipTrackOverrides
  ? ['video', 'fibi.webp']
  : ['offline', 'video', 'fibi.webp']

for (const relativePath of runtimePaths) {
  const source = join(runtime, relativePath)
  if (!existsSync(source)) throw new Error(`Missing compact30 runtime asset: ${relativePath}`)
  const destination = join(dist, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, { recursive: true })
}

rmSync(join(dist, 'audio/commentary'), { recursive: true, force: true })
if (skipTrackOverrides) rmSync(join(dist, 'offline'), { recursive: true, force: true })
console.log('Copied compact30 runtime assets; commentary excluded.')

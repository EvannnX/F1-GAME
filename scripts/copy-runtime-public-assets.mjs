import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()
const dist = join(root, 'dist')
const runtimeAssets = [
  'audio/commentary',
  'video/beginning.mp4',
  'fibi.webp',
]
const workspaceRuntimeAssets = [
  'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb',
  'src/shanghai-international-circuit-2018-layout/textures',
]
const excludedReleaseAssets = [
  'assets/上海赛车场.glb',
  'assets/上海赛车场压缩.glb',
  'assets/第一人称用',
]

for (const relativePath of excludedReleaseAssets) {
  rmSync(join(dist, relativePath), { recursive: true, force: true })
}

for (const relativePath of runtimeAssets) {
  const source = join(root, 'public', relativePath)
  if (!existsSync(source)) throw new Error(`Required public asset is missing: ${relativePath}`)
  const destination = join(dist, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, { recursive: true })
}

for (const relativePath of workspaceRuntimeAssets) {
  const source = join(root, relativePath)
  if (!existsSync(source)) throw new Error(`Required workspace asset is missing: ${relativePath}`)
  const destination = join(dist, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, { recursive: true })
}

console.log(
  `kept ${runtimeAssets.length + workspaceRuntimeAssets.length} runtime groups; ` +
  `removed ${excludedReleaseAssets.length} source-only groups`,
)

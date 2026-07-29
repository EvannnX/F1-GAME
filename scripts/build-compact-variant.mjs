import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const variant = process.argv[2]
const variants = {
  'lite-lion': {
    outDir: 'dist-lite-lion',
    env: {
      VITE_F1TI_COMPACT30: '1',
      VITE_F1TI_COMPRESSED_TRACK_TEXTURES: '1',
      VITE_F1TI_LITE_LION: '1',
      F1TI_COMPRESSED_TRACK_TEXTURES: '1',
    },
  },
}
const config = variants[variant]
if (!config) throw new Error(`Unknown compact variant: ${variant ?? '(missing)'}`)

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`)
  }
}

run(process.execPath, [join(root, 'scripts/prepare-compact30-assets.mjs')])
run(
  process.execPath,
  [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', config.outDir],
  config.env,
)
run(
  process.execPath,
  [join(root, 'scripts/copy-compact30-runtime.mjs')],
  {
    ...config.env,
    F1TI_COMPACT_OUT_DIR: config.outDir,
  },
)

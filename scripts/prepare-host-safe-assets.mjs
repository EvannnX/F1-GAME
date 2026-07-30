import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.cwd()
const output = join(root, '.host-safe-assets')
const decoderSource = join(
  root,
  'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js',
)
const decoderOutput = join(output, 'draco-decoder.js')

mkdirSync(dirname(decoderOutput), { recursive: true })

const decoder = readFileSync(decoderSource, 'utf8')
  .replaceAll('XMLHttpRequest', 'F1TILocalDisabledRequest')
  .replace(/\bfetch\b/g, 'F1TILocalDisabledFetch')
  .replaceAll('self.location.href', '""')

writeFileSync(decoderOutput, decoder)
console.log(
  `Prepared host-safe Draco decoder from ${fileURLToPath(import.meta.url)}.`,
)

import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { deflateSync, inflateSync } from 'node:zlib'

const root = process.cwd()
const dist = join(root, 'dist-host-safe')
const archive = join(root, 'f1ti-lite-fom-mobile.zip')
const assetsDirectory = join(dist, 'assets')

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('Host-safe build is missing index.html')
}

function encodeBinaryPng(sourcePath, outputPath, width) {
  const source = readFileSync(sourcePath)
  const payload = Buffer.allocUnsafe(source.length + 4)
  payload.writeUInt32BE(source.length, 0)
  source.copy(payload, 4)

  const pixelCount = Math.ceil(payload.length / 3)
  const height = Math.ceil(pixelCount / width)
  const rowBytes = width * 3
  const scanlines = Buffer.alloc((rowBytes + 1) * height)
  for (let row = 0; row < height; row++) {
    const sourceStart = row * rowBytes
    const sourceEnd = Math.min(sourceStart + rowBytes, payload.length)
    payload.copy(scanlines, row * (rowBytes + 1) + 1, sourceStart, sourceEnd)
  }

  const crc32 = (buffer) => {
    let crc = 0xffffffff
    for (const byte of buffer) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
      }
    }
    return (crc ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const typeBytes = Buffer.from(type, 'ascii')
    const body = Buffer.concat([typeBytes, data])
    const result = Buffer.allocUnsafe(body.length + 8)
    result.writeUInt32BE(data.length, 0)
    body.copy(result, 4)
    result.writeUInt32BE(crc32(body), body.length + 4)
    return result
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  writeFileSync(outputPath, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]))
}

function decodeBinaryPng(path) {
  const png = readFileSync(path)
  let offset = 8
  let width = 0
  let height = 0
  const idat = []
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
    } else if (type === 'IDAT') {
      idat.push(data)
    }
    offset += length + 12
  }
  const scanlines = inflateSync(Buffer.concat(idat))
  const rowBytes = width * 3
  const payload = Buffer.alloc(rowBytes * height)
  for (let row = 0; row < height; row++) {
    const sourceOffset = row * (rowBytes + 1)
    if (scanlines[sourceOffset] !== 0) {
      throw new Error(`Unexpected PNG filter in ${path}`)
    }
    scanlines.copy(
      payload,
      row * rowBytes,
      sourceOffset + 1,
      sourceOffset + rowBytes + 1,
    )
  }
  const length = payload.readUInt32BE(0)
  return payload.subarray(4, 4 + length)
}

const packagedAssets = [
]

for (const asset of packagedAssets) {
  encodeBinaryPng(asset.source, asset.output, asset.width)
  if (!decodeBinaryPng(asset.output).equals(readFileSync(asset.source))) {
    throw new Error(`Host-safe packaged asset failed verification: ${asset.key}`)
  }
}

const indexPath = join(dist, 'index.html')
const carDataName = 'asset-fom-data.js'
const carBase64 = readFileSync(join(root, '.host-safe-assets/fom-compatible.glb')).toString('base64')
writeFileSync(
  join(assetsDirectory, carDataName),
  `globalThis.__F1TI_ASSET_BASE64__={fom:'${carBase64}'}\n`,
)
const trackBase64 = readFileSync(
  join(root, 'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb'),
).toString('base64')
const trackChunkLength = 6_000_000
const trackDataNames = []
for (let offset = 0, part = 1; offset < trackBase64.length; offset += trackChunkLength, part++) {
  const name = `asset-shanghai-data-${String(part).padStart(2, '0')}.js`
  const payload = trackBase64.slice(offset, offset + trackChunkLength)
  const prefix = part === 1
    ? 'globalThis.__F1TI_ASSET_BASE64__.shanghai=[];'
    : ''
  writeFileSync(
    join(assetsDirectory, name),
    `${prefix}globalThis.__F1TI_ASSET_BASE64__.shanghai.push('${payload}')\n`,
  )
  trackDataNames.push(name)
}
const entries = packagedAssets.map((asset) => [
  asset.key,
  `./assets/${asset.output.slice(assetsDirectory.length + 1)}`,
])
const bootstrap = `<script>
    (function () {
      var entries = ${JSON.stringify(entries)};
      var manifest = globalThis.__F1TI_ASSET_IMAGE_URLS__ = Object.create(null);
      for (var index = 0; index < entries.length; index++) {
        manifest[entries[index][0]] = entries[index][1];
      }
    }());
  </script>`
const index = readFileSync(indexPath, 'utf8')
  .replace(/ crossorigin(="[^"]*")?/g, '')
  .replace(
    '<script type="module"',
    [
      `<script src="./assets/${carDataName}"></script>`,
      ...trackDataNames.map((name) => `    <script src="./assets/${name}"></script>`),
      `    ${bootstrap}`,
      '    <script type="module"',
    ].join('\n'),
  )
writeFileSync(indexPath, index)

rmSync(archive, { force: true })
execFileSync('zip', ['-9', '-r', archive, '.'], { cwd: dist, stdio: 'inherit' })

const zipEntries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)
const unsafeEntries = zipEntries.filter(
  (entry) => entry.startsWith('/')
    || entry.includes('../')
    || entry.includes('__MACOSX')
    || entry.startsWith('.'),
)
if (unsafeEntries.length > 0) {
  throw new Error(`Host-safe ZIP contains unsafe paths: ${unsafeEntries.join(', ')}`)
}
if (!zipEntries.includes('index.html')) {
  throw new Error('Host-safe ZIP requires root index.html')
}

const unpackedBytes = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .reduce((total, entry) => total + statSync(join(entry.parentPath, entry.name)).size, 0)

console.log(
  `Created f1ti-lite-fom-mobile.zip: ${statSync(archive).size.toLocaleString('en-US')} bytes, `
  + `${zipEntries.length} entries, ${unpackedBytes.toLocaleString('en-US')} unpacked bytes.`,
)

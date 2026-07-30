import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { deflateSync, inflateSync } from 'node:zlib'

const root = process.cwd()
const dist = join(root, 'dist-current-offline-upload')
const staging = join(root, '.f1ti-reference-upload-package')
const archive = join(root, process.env.F1TI_UPLOAD_ARCHIVE ?? 'F1TI_FOM_FULL_REFERENCE_UPLOAD.zip')
const carSource = join(
  root,
  process.env.F1TI_UPLOAD_CAR ?? '.compact30-assets/fom-player-no-draco.glb',
)
const mapSource = join(root, '.compact30-assets/shanghai-compact.glb')
const mapDecoderSource = join(root, '.offline8m-assets/draco-decoder.js')
const compactRuntime = join(root, '.compact30-assets/runtime')
const embeddedCar = process.env.F1TI_UPLOAD_EMBEDDED_CAR === '1'

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('Current offline build is missing index.html')
}
if (!existsSync(carSource)) {
  throw new Error('Decoded FOM car is missing')
}
if (!existsSync(mapSource) || !existsSync(mapDecoderSource)) {
  throw new Error('Full Shanghai map package assets are missing')
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBytes, data])
  const output = Buffer.allocUnsafe(body.length + 8)
  output.writeUInt32BE(data.length, 0)
  body.copy(output, 4)
  output.writeUInt32BE(crc32(body), body.length + 4)
  return output
}

function encodeBinaryPng(sourcePath, outputPath, auxiliaryPath) {
  const source = readFileSync(sourcePath)
  const auxiliary = auxiliaryPath ? readFileSync(auxiliaryPath) : null
  const payload = Buffer.allocUnsafe(source.length + 4 + (auxiliary ? auxiliary.length + 4 : 0))
  payload.writeUInt32BE(source.length, 0)
  source.copy(payload, 4)
  if (auxiliary) {
    payload.writeUInt32BE(auxiliary.length, source.length + 4)
    auxiliary.copy(payload, source.length + 8)
  }

  const width = 2048
  const rowBytes = width * 3
  const height = Math.ceil(payload.length / rowBytes)
  const scanlines = Buffer.alloc((rowBytes + 1) * height)
  for (let row = 0; row < height; row++) {
    const sourceStart = row * rowBytes
    const sourceEnd = Math.min(sourceStart + rowBytes, payload.length)
    payload.copy(scanlines, row * (rowBytes + 1) + 1, sourceStart, sourceEnd)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  writeFileSync(outputPath, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
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
    if (scanlines[sourceOffset] !== 0) throw new Error(`Unexpected PNG filter in ${path}`)
    scanlines.copy(payload, row * rowBytes, sourceOffset + 1, sourceOffset + rowBytes + 1)
  }
  const sourceLength = payload.readUInt32BE(0)
  const auxiliaryOffset = sourceLength + 4
  const auxiliaryLength = payload.readUInt32BE(auxiliaryOffset)
  return {
    source: payload.subarray(4, 4 + sourceLength),
    auxiliary: auxiliaryLength > 0
      ? payload.subarray(auxiliaryOffset + 4, auxiliaryOffset + 4 + auxiliaryLength)
      : null,
  }
}

const sourceIndex = readFileSync(join(dist, 'index.html'), 'utf8')
  .replace(/ crossorigin(="[^"]*")?/g, '')
const inlineModule = sourceIndex.match(/<script type="module">([\s\S]*?)<\/script>/)
if (!inlineModule) throw new Error('Current offline build is missing its inline module')

rmSync(staging, { recursive: true, force: true })
mkdirSync(join(staging, 'assets'), { recursive: true })
mkdirSync(join(staging, 'video'), { recursive: true })
mkdirSync(join(staging, 'track-textures'), { recursive: true })
cpSync(join(compactRuntime, 'video'), join(staging, 'video'), { recursive: true })
cpSync(join(compactRuntime, 'track-textures'), join(staging, 'track-textures'), { recursive: true })

const appFileName = process.env.F1TI_UPLOAD_APP ?? 'index-f1ti-current.js'
const appSource = inlineModule[1]
  .replaceAll('http://www.w3.org/2000/svg', 'http:\\u002f\\u002fwww.w3.org/2000/svg')
  .replaceAll('http://www.w3.org/1999/xlink', 'http:\\u002f\\u002fwww.w3.org/1999/xlink')

const blockedPatterns = [
  ['fetch network request', /\bfetch\s*\(/],
  ['XMLHttpRequest network request', /\bXMLHttpRequest\b/],
  ['WebSocket network request', /\bWebSocket\b/],
  ['clipboard API', /navigator\.clipboard/],
]
for (const [label, pattern] of blockedPatterns) {
  if (pattern.test(appSource)) throw new Error(`Current game script contains ${label}`)
}

const packagedAssetKeys = new Set(
  [...appSource.matchAll(/f1ti-asset:([a-z0-9_-]+)/g)].map((match) => match[1]),
)
const expectedAssetKeys = embeddedCar ? ['shanghai'] : ['fom', 'shanghai']
for (const key of expectedAssetKeys) {
  if (!packagedAssetKeys.has(key)) throw new Error(`Current game script is missing ${key}`)
}
for (const key of packagedAssetKeys) {
  if (!expectedAssetKeys.includes(key)) {
    throw new Error(`Current game script references unpackaged asset: ${key}`)
  }
}

for (const marker of [
  'creator-special',
  'creator-partner',
  'fom-special',
  'fom-partner',
  'garagePreview',
]) {
  if (!appSource.includes(marker)) throw new Error(`Current game script is missing feature: ${marker}`)
}
writeFileSync(join(staging, 'assets', appFileName), appSource)

const carFileName = 'asset-fom.png'
const carOutput = join(staging, 'assets', carFileName)
const carNeedsDraco = readFileSync(carSource).includes(Buffer.from('KHR_draco_mesh_compression'))
if (embeddedCar) {
  const embeddedModels = [...appSource.matchAll(
    /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/g,
  )].map((match) => Buffer.from(match[1], 'base64'))
  if (!embeddedModels.some((model) => model.equals(readFileSync(carSource)))) {
    throw new Error('Current game script is missing the exact embedded FOM car')
  }
} else {
  encodeBinaryPng(carSource, carOutput, carNeedsDraco ? mapDecoderSource : undefined)
}
const mapFileName = 'asset-shanghai.png'
const mapOutput = join(staging, 'assets', mapFileName)
encodeBinaryPng(mapSource, mapOutput, mapDecoderSource)

const decodedMap = decodeBinaryPng(mapOutput)
if (!embeddedCar) {
  const decodedCar = decodeBinaryPng(carOutput)
  if (!decodedCar.source.equals(readFileSync(carSource))) {
    throw new Error('Packaged FOM car failed byte-for-byte verification')
  }
  if (carNeedsDraco && !decodedCar.auxiliary?.equals(readFileSync(mapDecoderSource))) {
    throw new Error('Packaged FOM decoder failed byte-for-byte verification')
  }
  if (!carNeedsDraco && decodedCar.auxiliary) {
    throw new Error('Packaged uncompressed FOM car contains an unnecessary decoder')
  }
}
if (!decodedMap.source.equals(readFileSync(mapSource))) {
  throw new Error('Packaged Shanghai map failed byte-for-byte verification')
}
if (!decodedMap.auxiliary?.equals(readFileSync(mapDecoderSource))) {
  throw new Error('Packaged Shanghai decoder failed byte-for-byte verification')
}
cpSync(join(compactRuntime, 'fibi.webp'), join(staging, 'fibi.webp'))

const assetManifest = embeddedCar
  ? [['shanghai', `./assets/${mapFileName}`]]
  : [['fom', `./assets/${carFileName}`], ['shanghai', `./assets/${mapFileName}`]]
const bootstrap = `<script>
    (function () {
      var entries = ${JSON.stringify(assetManifest)};
      var manifest = globalThis.__F1TI_ASSET_IMAGE_URLS__ = Object.create(null);
      for (var index = 0; index < entries.length; index++) {
        manifest[entries[index][0]] = entries[index][1];
      }
    }());
  </script>
  <script type="module" src="./assets/${appFileName}"></script>`
const packagedIndex = sourceIndex
  .replace(inlineModule[0], bootstrap)
writeFileSync(join(staging, 'index.html'), packagedIndex)

rmSync(archive, { force: true })
execFileSync('zip', ['-X', '-9', '-r', archive, 'video', 'index.html', 'fibi.webp', 'track-textures', 'assets'], {
  cwd: staging,
  stdio: 'inherit',
})

const zipEntries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
  .trim()
  .split('\n')
if (zipEntries.filter((entry) => entry.endsWith('index.html')).length !== 1) {
  throw new Error('ZIP must contain one index.html')
}
if (!zipEntries.includes(`assets/${appFileName}`)) {
  throw new Error('ZIP is missing the current game script')
}
if (!embeddedCar && !zipEntries.includes(`assets/${carFileName}`)) {
  throw new Error('ZIP is missing the packaged FOM car')
}
if (!zipEntries.includes(`assets/${mapFileName}`)) {
  throw new Error('ZIP is missing the packaged Shanghai map')
}

console.log(
  `Created ${archive}: ${statSync(archive).size.toLocaleString('en-US')} bytes`,
)
if (statSync(archive).size > 30_000_000) {
  throw new Error('Compact30 ZIP exceeds 30,000,000 bytes')
}

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { deflateSync, inflateSync } from 'node:zlib'

const root = process.cwd()
const dist = join(root, 'dist-offline8m')
const generated = join(root, '.offline8m-assets')
const runtime = join(root, '.offline8m-assets/runtime')
const staging = join(root, '.offline8m-package')
const archive = join(root, 'f1ti-offline-8mb.zip')
// Some uploader versions validate the ZIP and others validate extracted bytes.
// Enforce the decimal limit against both representations.
const maxBytes = 8_000_000
const allowOversize = process.env.F1TI_ALLOW_OVERSIZE === '1'
const acceptedEntryCount = 18
const acceptedTopLevelEntries = ['index.html', 'dist/']
const requiredAcceptedEntries = [
  'dist/assets/',
  'dist/assets/asset-redbull.png',
  'dist/assets/asset-shanghai.png',
  'dist/assets/asset-mercedes.png',
  'dist/assets/asset-mclaren.png',
  'dist/assets/asset-ferrari.png',
  'dist/assets/index-f1ti-v11.js',
  'dist/fibi.webp',
  'dist/video/',
  'dist/video/beginning.mp4',
  'dist/audio/',
  'dist/offline/',
  'dist/offline/textures/',
  'dist/offline/textures/asphalt.jpg',
  'dist/offline/textures/grass.jpg',
  'dist/offline/textures/paddock.jpg',
]

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(path) : [path]
  })
}

if (!existsSync(join(dist, 'index.html'))) throw new Error('Offline build is missing index.html')
for (const relativePath of ['offline', 'audio', 'video', 'fibi.webp']) {
  const source = join(runtime, relativePath)
  const destination = join(dist, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination, { recursive: true })
}

const indexPath = join(dist, 'index.html')
const indexHtml = readFileSync(indexPath, 'utf8').replace(/ crossorigin(="[^"]*")?/g, '')
const inlineModule = indexHtml.match(/<script type="module">([\s\S]*?)<\/script>/)
if (!inlineModule) throw new Error('Offline build is missing its inline module')

const assetsDirectory = join(dist, 'assets')
mkdirSync(assetsDirectory, { recursive: true })
const appSource = inlineModule[1]
  .replaceAll('http://www.w3.org/2000/svg', 'http:\\u002f\\u002fwww.w3.org/2000/svg')
  .replaceAll('http://www.w3.org/1999/xlink', 'http:\\u002f\\u002fwww.w3.org/1999/xlink')
const appFileName = 'index-f1ti-v11.js'
writeFileSync(join(assetsDirectory, appFileName), appSource)

const embeddedAssets = new Map([
  ['shanghai', 'shanghai-mobile.glb'],
  ['redbull', 'redbull-mobile.glb'],
  ['ferrari', 'ferrari-mobile.glb'],
  ['mercedes', 'mercedes-mobile.glb'],
  ['mclaren', 'mclaren-mobile.glb'],
])

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
  const pixelCount = Math.ceil(payload.length / 3)
  const height = Math.ceil(pixelCount / width)
  const rowBytes = width * 3
  const scanlines = Buffer.alloc((rowBytes + 1) * height)
  for (let row = 0; row < height; row++) {
    const sourceStart = row * rowBytes
    const sourceEnd = Math.min(sourceStart + rowBytes, payload.length)
    payload.copy(scanlines, row * (rowBytes + 1) + 1, sourceStart, sourceEnd)
  }

  function crc32(buffer) {
    let crc = 0xffffffff
    for (const byte of buffer) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  function chunk(type, data) {
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
    if (scanlines[sourceOffset] !== 0) throw new Error(`Unexpected PNG filter in ${path}`)
    scanlines.copy(payload, row * rowBytes, sourceOffset + 1, sourceOffset + rowBytes + 1)
  }
  const length = payload.readUInt32BE(0)
  const auxiliaryOffset = length + 4
  const auxiliaryLength = auxiliaryOffset + 4 <= payload.length
    ? payload.readUInt32BE(auxiliaryOffset)
    : 0
  return {
    source: payload.subarray(4, 4 + length),
    auxiliary: auxiliaryLength > 0
      ? payload.subarray(auxiliaryOffset + 4, auxiliaryOffset + 4 + auxiliaryLength)
      : null,
  }
}

const assetManifest = []
for (const [key, sourceName] of embeddedAssets) {
  const sourcePath = join(generated, sourceName)
  const fileName = `asset-${key}.png`
  const outputPath = join(assetsDirectory, fileName)
  const sourceBytes = readFileSync(sourcePath)
  const needsDracoDecoder =
    key === 'shanghai' && sourceBytes.includes(Buffer.from('KHR_draco_mesh_compression'))
  encodeBinaryPng(
    sourcePath,
    outputPath,
    needsDracoDecoder ? join(generated, 'draco-decoder.js') : undefined,
  )
  const decoded = decodeBinaryPng(outputPath)
  if (!decoded.source.equals(sourceBytes)) {
    throw new Error(`Packaged asset failed byte-for-byte verification: ${key}`)
  }
  if (needsDracoDecoder && !decoded.auxiliary?.equals(readFileSync(join(generated, 'draco-decoder.js')))) {
    throw new Error('Packaged Shanghai decoder failed byte-for-byte verification')
  }
  if (!needsDracoDecoder && decoded.auxiliary) {
    throw new Error('Packaged Shanghai asset contains an unnecessary decoder')
  }
  assetManifest.push([key, `./assets/${fileName}`])
}

const bootstrap = `<script>
    (function () {
      var entries = ${JSON.stringify(assetManifest)};
      var manifest = globalThis.__F1TI_ASSET_IMAGE_URLS__ = Object.create(null);
      for (var index = 0; index < entries.length; index++) manifest[entries[index][0]] = entries[index][1];
    }());
  </script>
  <script defer src="./assets/${appFileName}"></script>`
writeFileSync(
  indexPath,
  indexHtml.replace(inlineModule[0], bootstrap),
)

rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
cpSync(dist, join(staging, 'dist'), { recursive: true })
const rootIndexHtml = readFileSync(join(staging, 'dist/index.html'), 'utf8')
  .replace('<head>', '<head>\n    <base href="./dist/">')
writeFileSync(join(staging, 'index.html'), rootIndexHtml)
rmSync(join(staging, 'dist/index.html'))

const unpackedBytes = walkFiles(staging).reduce((total, path) => total + statSync(path).size, 0)
rmSync(archive, { force: true })
execFileSync('zip', ['-9', archive, 'index.html'], { cwd: staging, stdio: 'inherit' })
execFileSync('zip', ['-9', archive, 'dist'], { cwd: staging, stdio: 'inherit' })
execFileSync('zip', ['-9', '-r', archive, 'dist/assets'], { cwd: staging, stdio: 'inherit' })
execFileSync(
  'zip',
  ['-9', '-r', archive, 'dist/fibi.webp', 'dist/video', 'dist/audio', 'dist/offline'],
  { cwd: staging, stdio: 'inherit' },
)
const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n')
if (!acceptedTopLevelEntries.every((entry, index) => entries[index] === entry)) {
  throw new Error('ZIP must match the accepted root-index plus dist layout')
}
if (entries.length !== acceptedEntryCount) {
  throw new Error(`ZIP must preserve the accepted ${acceptedEntryCount}-entry layout; found ${entries.length}`)
}
for (const entry of requiredAcceptedEntries) {
  if (!entries.includes(entry)) throw new Error(`ZIP is missing accepted entry: ${entry}`)
}
if (entries.some((entry) => entry.includes('__MACOSX') || entry.startsWith('.'))) {
  throw new Error('ZIP contains unsupported metadata or hidden entries')
}
if (entries.includes('dist/index.html')) throw new Error('index.html must be the unique entry')
if (!entries.includes(`dist/assets/${appFileName}`)) throw new Error('ZIP does not contain the app module')

const bytes = statSync(archive).size
if (!allowOversize && bytes > maxBytes) {
  throw new Error(`Offline ZIP is ${bytes.toLocaleString('en-US')} bytes; limit is 8,000,000 bytes`)
}
if (!allowOversize && unpackedBytes > maxBytes) {
  throw new Error(
    `Offline package is ${unpackedBytes.toLocaleString('en-US')} bytes unpacked; ` +
    'limit is 8,000,000 bytes',
  )
}
console.log(
  `Created f1ti-offline-8mb.zip: ${bytes.toLocaleString('en-US')} bytes compressed, ` +
  `${unpackedBytes.toLocaleString('en-US')} bytes unpacked`,
)

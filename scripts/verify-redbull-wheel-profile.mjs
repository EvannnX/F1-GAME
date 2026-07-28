import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const EXPECTED = {
  sourceCommit: 'ccc253bf5cbd7e2f09d981eb813ac69071bffc26',
  modelSha1: '66c78ca97b11d3cbaf20f2bf9c7eec7a2614d3ae',
  wheelFunctionSha1: '1143545cc0e6b8a857b738ea412948d4583dbdb7',
  profileRevision: '2026-07-25-independent-rear-tire-camber-axes',
}

const sha1 = (value) => createHash('sha1').update(value).digest('hex')
const fail = (message) => {
  console.error(`[redbull-wheel-profile] FAIL: ${message}`)
  process.exitCode = 1
}

function parseGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'invalid GLB magic')
  assert.equal(bytes.readUInt32LE(4), 2, 'only GLB v2 is supported')

  const jsonLength = bytes.readUInt32LE(12)
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'missing JSON chunk')
  const jsonStart = 20
  const jsonEnd = jsonStart + jsonLength
  const json = JSON.parse(bytes.subarray(jsonStart, jsonEnd).toString('utf8').trim())

  assert.ok(jsonEnd + 8 <= bytes.length, 'missing BIN chunk')
  const binLength = bytes.readUInt32LE(jsonEnd)
  assert.equal(bytes.readUInt32LE(jsonEnd + 4), 0x004e4942, 'invalid BIN chunk')
  const binStart = jsonEnd + 8
  const bin = Buffer.from(bytes.subarray(binStart, binStart + binLength))
  return { json, bin }
}

function verifyOfflineModelPreservesGeometry(sourceBytes, offlineBytes) {
  const source = parseGlb(sourceBytes)
  const offline = parseGlb(offlineBytes)

  assert.equal(offline.bin.length, source.bin.length, 'BIN layout changed')
  assert.equal(
    offline.json.images?.length ?? 0,
    source.json.images?.length ?? 0,
    'image count changed',
  )

  const sourceJson = structuredClone(source.json)
  const offlineJson = structuredClone(offline.json)

  for (let index = 0; index < (sourceJson.images?.length ?? 0); index += 1) {
    const sourceImage = sourceJson.images[index]
    const offlineImage = offlineJson.images[index]
    assert.equal(offlineImage.bufferView, sourceImage.bufferView, `image ${index} moved`)
    assert.equal(offlineImage.mimeType, sourceImage.mimeType, `image ${index} type changed`)

    const sourceView = sourceJson.bufferViews[sourceImage.bufferView]
    const offlineView = offlineJson.bufferViews[offlineImage.bufferView]
    assert.equal(
      offlineView.byteOffset ?? 0,
      sourceView.byteOffset ?? 0,
      `image ${index} byte offset changed`,
    )
    assert.ok(
      offlineView.byteLength <= sourceView.byteLength,
      `image ${index} exceeds its original allocation`,
    )

    const byteOffset = sourceView.byteOffset ?? 0
    const byteEnd = byteOffset + sourceView.byteLength
    source.bin.fill(0, byteOffset, byteEnd)
    offline.bin.fill(0, byteOffset, byteEnd)
    offlineView.byteLength = sourceView.byteLength
  }

  assert.deepEqual(
    offlineJson,
    sourceJson,
    'geometry, node, material, or animation metadata changed',
  )
  assert.ok(offline.bin.equals(source.bin), 'non-image binary data changed')
}

const model = readFileSync('src/assets/models/RB19_REDBULL.opt.glb')
const modelSha1 = sha1(model)
if (modelSha1 !== EXPECTED.modelSha1) {
  fail(`model hash changed: ${modelSha1}`)
}

const offlineModelPath = '.offline8m-assets/redbull-mobile.glb'
if (existsSync(offlineModelPath)) {
  try {
    verifyOfflineModelPreservesGeometry(model, readFileSync(offlineModelPath))
  } catch (error) {
    fail(`offline Red Bull model changed protected data: ${error.message}`)
  }
}

const carSource = readFileSync('src/render/car.ts', 'utf8')
const functionStart = carSource.indexOf('function createRedBullWheelRigs')
const bodyStart = carSource.indexOf('{', functionStart)
let functionEnd = -1
let braceDepth = 0
for (let index = bodyStart; index >= 0 && index < carSource.length; index += 1) {
  if (carSource[index] === '{') braceDepth += 1
  if (carSource[index] === '}') {
    braceDepth -= 1
    if (braceDepth === 0) {
      functionEnd = index + 1
      break
    }
  }
}
if (functionStart < 0 || bodyStart < 0 || functionEnd < 0) {
  fail('createRedBullWheelRigs could not be located')
} else {
  const wheelFunctionSha1 = sha1(carSource.slice(functionStart, functionEnd))
  if (wheelFunctionSha1 !== EXPECTED.wheelFunctionSha1) {
    fail(`wheel function changed: ${wheelFunctionSha1}`)
  }
}

const strategySource = readFileSync('src/data/playerCars.ts', 'utf8')
const redBullBlock = strategySource.match(/id: 'redbull',[\s\S]*?wheelStrategy: '([^']+)'/)
if (redBullBlock?.[1] !== 'redbull-github-v1') {
  fail(`Red Bull strategy changed: ${redBullBlock?.[1] ?? 'missing'}`)
}
for (const carId of ['ferrari', 'mercedes', 'creator', 'creator-special', 'audi']) {
  const block = strategySource.match(new RegExp(`id: '${carId}',[\\s\\S]*?wheelStrategy: '([^']+)'`))
  if (block?.[1] === 'redbull-github-v1') fail(`${carId} is using the Red Bull strategy`)
}

if (!process.exitCode) {
  console.log(
    `[redbull-wheel-profile] OK (${EXPECTED.profileRevision}; geometry and wheel data protected)`,
  )
}

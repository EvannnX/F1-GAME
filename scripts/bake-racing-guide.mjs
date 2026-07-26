import fs from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

globalThis.self = globalThis
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })

const MODEL_PATH = 'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb'
const ROUTE_PATH = 'src/data/shanghaiGlbRoadRoute.ts'
const OUTPUT_PATH = 'src/data/shanghaiOptimalRacingLine.ts'
const DASH_LENGTH = 3.6
const DASH_GAP = 1.65
const INDEX_CELL_SIZE = 4

function loadModel() {
  const bytes = fs.readFileSync(MODEL_PATH)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  return new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject))
}

function readRoute() {
  const source = fs.readFileSync(ROUTE_PATH, 'utf8')
  return [...source.matchAll(/\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g)]
    .map((match) => [Number(match[1]), Number(match[2])])
}

function signedTurn(curve, t, delta = 0.007) {
  const before = curve.getTangentAt(THREE.MathUtils.euclideanModulo(t - delta, 1)).setY(0).normalize()
  const after = curve.getTangentAt(THREE.MathUtils.euclideanModulo(t + delta, 1)).setY(0).normalize()
  const angle = Math.acos(THREE.MathUtils.clamp(before.dot(after), -1, 1))
  return Math.sign(new THREE.Vector3().crossVectors(before, after).y) * angle
}

function targetSpeedAt(curve, t) {
  let maxTurn = 0
  for (const lookAhead of [0.006, 0.012, 0.02, 0.03]) {
    maxTurn = Math.max(maxTurn, Math.abs(signedTurn(curve, t + lookAhead)))
  }
  return THREE.MathUtils.clamp(55 - maxTurn * 105, 13, 55)
}

function smoothClosedSpeedProfile(samples, distanceStep) {
  const braking = 10.5
  const acceleration = 5.5
  for (let pass = 0; pass < 5; pass++) {
    for (let i = samples.length - 1; i >= 0; i--) {
      const next = (i + 1) % samples.length
      const brakingLimit = Math.sqrt(samples[next].speed ** 2 + 2 * braking * distanceStep)
      samples[i].speed = Math.min(samples[i].speed, brakingLimit)
    }
    for (let i = 0; i < samples.length; i++) {
      const next = (i + 1) % samples.length
      const accelerationLimit = Math.sqrt(samples[i].speed ** 2 + 2 * acceleration * distanceStep)
      samples[next].speed = Math.min(samples[next].speed, accelerationLimit)
    }
  }
}

function buildRoadIndex(root) {
  const cells = new Map()
  const roadBounds = new THREE.Box3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const edge1 = new THREE.Vector3()
  const edge2 = new THREE.Vector3()
  const normal = new THREE.Vector3()
  let triangleCount = 0

  const key = (x, z) => `${x}:${z}`
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    if (!materials.some((material) => material.name.toLowerCase().includes('tarmac'))) return
    roadBounds.expandByObject(obj)
    const position = obj.geometry.getAttribute('position')
    const index = obj.geometry.index
    const count = index ? index.count : position.count
    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i
      const ib = index ? index.getX(i + 1) : i + 1
      const ic = index ? index.getX(i + 2) : i + 2
      a.fromBufferAttribute(position, ia).applyMatrix4(obj.matrixWorld)
      b.fromBufferAttribute(position, ib).applyMatrix4(obj.matrixWorld)
      c.fromBufferAttribute(position, ic).applyMatrix4(obj.matrixWorld)
      normal.crossVectors(edge1.subVectors(b, a), edge2.subVectors(c, a)).normalize()
      if (normal.y < 0.35) continue
      const triangle = {
        ax: a.x, ay: a.y, az: a.z,
        bx: b.x, by: b.y, bz: b.z,
        cx: c.x, cy: c.y, cz: c.z,
        nx: normal.x, ny: normal.y, nz: normal.z,
      }
      const minX = Math.floor(Math.min(a.x, b.x, c.x) / INDEX_CELL_SIZE)
      const maxX = Math.floor(Math.max(a.x, b.x, c.x) / INDEX_CELL_SIZE)
      const minZ = Math.floor(Math.min(a.z, b.z, c.z) / INDEX_CELL_SIZE)
      const maxZ = Math.floor(Math.max(a.z, b.z, c.z) / INDEX_CELL_SIZE)
      for (let gx = minX; gx <= maxX; gx++) {
        for (let gz = minZ; gz <= maxZ; gz++) {
          const cellKey = key(gx, gz)
          const bucket = cells.get(cellKey)
          if (bucket) bucket.push(triangle)
          else cells.set(cellKey, [triangle])
        }
      }
      triangleCount++
    }
  })

  const sample = (x, z) => {
    const bucket = cells.get(key(Math.floor(x / INDEX_CELL_SIZE), Math.floor(z / INDEX_CELL_SIZE)))
    if (!bucket) return null
    let best = null
    for (const triangle of bucket) {
      const v0x = triangle.bx - triangle.ax
      const v0z = triangle.bz - triangle.az
      const v1x = triangle.cx - triangle.ax
      const v1z = triangle.cz - triangle.az
      const v2x = x - triangle.ax
      const v2z = z - triangle.az
      const denominator = v0x * v1z - v1x * v0z
      if (Math.abs(denominator) < 1e-8) continue
      const u = (v2x * v1z - v1x * v2z) / denominator
      const v = (v0x * v2z - v2x * v0z) / denominator
      if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue
      const y = triangle.ay + u * (triangle.by - triangle.ay) + v * (triangle.cy - triangle.ay)
      if (!best || y > best.y) {
        best = { x, y, z, nx: triangle.nx, ny: triangle.ny, nz: triangle.nz }
      }
    }
    return best
  }
  return { roadBounds, sample, triangleCount }
}

const gltf = await loadModel()
const model = gltf.scene
model.updateMatrixWorld(true)
const initialBox = new THREE.Box3().setFromObject(model)
const initialCenter = initialBox.getCenter(new THREE.Vector3())
model.position.x -= initialCenter.x
model.position.z -= initialCenter.z
model.position.y -= initialBox.min.y
model.updateMatrixWorld(true)

const { sample, triangleCount } = buildRoadIndex(model)
let racelineMesh = null
model.traverse((obj) => {
  if (!(obj instanceof THREE.Mesh)) return
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
  if (materials.some((material) => material.name === 'raceline')) racelineMesh = obj
})
if (!racelineMesh) throw new Error('raceline mesh not found in optimized Shanghai model')

const position = racelineMesh.geometry.getAttribute('position')
const uv = racelineMesh.geometry.getAttribute('uv')
const rows = new Map()
for (let index = 0; index < position.count; index++) {
  const rowKey = uv.getY(index).toFixed(4)
  const distanceToCenter = Math.abs(uv.getX(index) - 0.5)
  const existing = rows.get(rowKey)
  if (!existing || distanceToCenter < existing.distanceToCenter) {
    rows.set(rowKey, { index, distanceToCenter, longitudinalUv: uv.getY(index) })
  }
}
const route = [...rows.values()]
  .sort((a, b) => a.longitudinalUv - b.longitudinalUv)
  .map((row) => new THREE.Vector3()
    .fromBufferAttribute(position, row.index)
    .applyMatrix4(racelineMesh.matrixWorld))
// The source raceline is stored opposite to the actual race direction.
// Build the curve in driving order so braking look-ahead is calculated in the
// direction the car moves. Keep positions on the model-authored raceline:
// lateral road scans can accidentally jump to a nearby lane at intersections.
const driveCurve = new THREE.CatmullRomCurve3([...route].reverse(), true, 'centripetal', 0.5)
driveCurve.arcLengthDivisions = Math.max(8192, route.length * 8)
driveCurve.updateArcLengths()
const routeLength = driveCurve.getLength()
const dashCount = Math.floor(routeLength / (DASH_LENGTH + DASH_GAP))
const driveSamples = []
for (let index = 0; index < dashCount; index++) {
  const t = (index * (DASH_LENGTH + DASH_GAP) + DASH_LENGTH * 0.5) / routeLength
  const linePoint = driveCurve.getPointAt(t)
  const hit = sample(linePoint.x, linePoint.z)
  const normal = hit
    ? new THREE.Vector3(hit.nx, hit.ny, hit.nz)
    : new THREE.Vector3(0, 1, 0)
  const forward = driveCurve.getTangentAt(t)
  forward.addScaledVector(normal, -forward.dot(normal)).normalize()
  driveSamples.push({
    point: linePoint,
    normal,
    forward,
    speed: targetSpeedAt(driveCurve, t),
  })
}
smoothClosedSpeedProfile(driveSamples, DASH_LENGTH + DASH_GAP)

// Preserve the historical data order expected by lap/finish code. Forward is
// stored in that same source order, while speed remains associated with the
// correctly calculated physical position.
const output = driveSamples.reverse().map(({ point, normal, forward, speed }) => {
  forward.negate()
  return [
    point.x, point.y + 0.055, point.z,
    normal.x, normal.y, normal.z,
    forward.x, forward.y, forward.z,
    speed,
  ].map((value) => Number(value.toFixed(4)))
})

let startFinishMarker = null
model.traverse((obj) => {
  if (!(obj instanceof THREE.Mesh)) return
  const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
  if (materials.some((material) => material.name === 'sha_banner_startfinish_a')) {
    startFinishMarker = obj
  }
})
if (!startFinishMarker) throw new Error('start/finish marker not found in optimized Shanghai model')
const finishMarkerCenter = new THREE.Box3()
  .setFromObject(startFinishMarker)
  .getCenter(new THREE.Vector3())
let finishLineIndex = 0
let finishLineDistanceSq = Infinity
output.forEach((sample, index) => {
  const distanceSq = (sample[0] - finishMarkerCenter.x) ** 2 +
    (sample[2] - finishMarkerCenter.z) ** 2
  if (distanceSq < finishLineDistanceSq) {
    finishLineDistanceSq = distanceSq
    finishLineIndex = index
  }
})

const file = `// Generated by scripts/bake-racing-guide.mjs from shanghai_meshopt.glb.\n` +
  `// [x, y, z, normalX, normalY, normalZ, forwardX, forwardY, forwardZ, targetSpeedMps]\n` +
  `export const SHANGHAI_OPTIMAL_RACING_LINE = ${JSON.stringify(output)} as const\n` +
  `export const SHANGHAI_FINISH_LINE_INDEX = ${finishLineIndex}\n`
fs.writeFileSync(OUTPUT_PATH, file)
console.log({
  model: MODEL_PATH,
  roadTriangles: triangleCount,
  source: 'raceline mesh',
  sourceCrossSections: route.length,
  routeLength: Math.round(routeLength),
  requestedDashes: dashCount,
  bakedDashes: output.length,
  coverage: `${Math.round(output.length / dashCount * 100)}%`,
  finishLine: {
    marker: 'sha_banner_startfinish_a',
    index: finishLineIndex,
    distanceToMarker: Number(Math.sqrt(finishLineDistanceSq).toFixed(2)),
  },
  output: OUTPUT_PATH,
})

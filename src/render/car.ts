import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { TeamId } from '../utils/storage'
import { showToast } from '../utils/error'
import {
  playerCarById,
  wheelStrategyForPlayerCar,
  type PlayerCarId,
} from '../data/playerCars'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'
import { loadLocalAsset } from '../utils/localAsset'
import {
  applyFomSpecialLivery,
  applyFomThemeColor,
  readFomThemeColor,
  type FomSpecialLivery,
} from './fomSpecialLivery'
import { applyCustomLivery, clearCustomLivery } from './customLogo'

export const TEAM_COLORS: Record<TeamId, { primary: string; secondary: string; spark: string }> = {
  merc: { primary: '#00d2be', secondary: '#181818', spark: '#a8fff5' },
  ferrari: { primary: '#dc0000', secondary: '#ffee00', spark: '#ffd870' },
  redbull: { primary: '#1e41ff', secondary: '#ffeb00', spark: '#ffe770' },
  mclaren: { primary: '#ff8000', secondary: '#0090d0', spark: '#ffd0a0' },
}

export interface CarBundle {
  group: THREE.Group
  /** World-space particle layer; add to the scene next to `group`. */
  particles: THREE.Group
  setLivery: (team: TeamId) => void
  emitSpeedTrail: (intensity: number) => void
  emitSparks: (worldPos: THREE.Vector3, count: number) => void
  setCarModel: (id: PlayerCarId) => Promise<void>
  setFrontAxleDebugOffset: (y: number, z: number) => void
  getFrontAxleDebug: () => Array<{ name: string; center: THREE.Vector3; axis: THREE.Vector3 }>
  getWheelAxleDebug: () => Array<{ name: string; center: THREE.Vector3; axis: THREE.Vector3 }>
  update: (dt: number, speed01: number, steer?: number) => void
  dispose: () => void
}

export interface CarOptions {
  visualScale?: number
  carId?: PlayerCarId
}

const PARTICLE_MAX = 256
const PARTICLE_LIFE = 1.0
const TARGET_LENGTH_M = 5.0 // real F1 ≈ 5.5 m; pick 5 to feel right against 16 m wide road
const FRONT_STEER_MAX_RAD = THREE.MathUtils.degToRad(18)
export const PLAYER_WHEEL_SPIN_RATE = 42
const WHEEL_SPIN_AXIS = new THREE.Vector3(0, 0, 1)
const WHEEL_STEER_AXIS = new THREE.Vector3(0, 1, 0)
const LION_MAX_BODY_ROLL_RAD = THREE.MathUtils.degToRad(16)
const LION_HALF_TRACK_M = 0.82
const LION_ROLL_SPRING = 46
const LION_ROLL_DAMPING = 9
const FRONT_WHEEL_ROLL_SHELL_RATIO = 0.76
const FRONT_WHEEL_INNER_SIDE_MARGIN = 0.04
const REAR_WHEEL_ROLL_SHELL_RATIO = 0.42
const REAR_WHEEL_INNER_SIDE_MARGIN = 1

const PLAYER_WHEEL_PARTS = [
  { name: 'left-front', steerParts: [3], spinParts: [3], steerable: true, sharedSpinCenter: true },
  { name: 'right-front', steerParts: [4], spinParts: [4], steerable: true, sharedSpinCenter: true },
  { name: 'left-rear', steerParts: [1], spinParts: [1], steerable: false, sharedSpinCenter: false },
  { name: 'right-rear', steerParts: [2], spinParts: [2], steerable: false, sharedSpinCenter: false },
] as const

const PLAYER_STATIC_WHEEL_LINK_PARTS = [15] as const

const PLAYER_STEER_ONLY_PARTS = [
  { name: 'left-front-aero', parts: [55] },
  { name: 'right-front-aero', parts: [58] },
] as const

const FRONT_WHEEL_SPLIT_PARTS = [1, 4] as const
const REAR_WHEEL_SPLIT_PARTS = [5] as const

const RED_BULL_WHEEL_MATERIALS = new Set([
  'front_rims',
  'rear_rims',
  'material_105',
  'material_97',
  'material_102',
  'flasks',
  'brakes_in',
  'baked_fix_roue',
])

const RED_BULL_AXLE_REFERENCE_MATERIALS = new Set([
  'front_rims',
  'rear_rims',
  'material_105',
  'material_97',
  'material_102',
])

// REAR_RIMS is visually part of the wheel, but its thinnest PCA dimension is
// almost vertical in this export. Use the tire/rim-shell geometry that agrees
// on the authored rear camber axis instead.
const RED_BULL_REAR_AXLE_REFERENCE_MATERIALS = new Set([
  'material_105',
  'material_97',
  'material_102',
])

const RED_BULL_WHEEL_AERO_SOURCE_MATERIALS = new Set([
  'suspensions',
])

type RedBullWheelSlot = 'left-front' | 'right-front' | 'left-rear' | 'right-rear'
type PlayerWheelSlot = RedBullWheelSlot

interface RedBullWheelComponents {
  rolling: Map<RedBullWheelSlot, THREE.Object3D[]>
  steering: Map<RedBullWheelSlot, THREE.Object3D[]>
}

interface MaterialWheelProfile {
  materials: ReadonlySet<string>
  lateralMinRatio: number
  longitudinalMinRatio: number
}

const MATERIAL_WHEEL_PROFILES: Record<'mclaren', MaterialWheelProfile> = {
  mclaren: {
    materials: new Set(['rim_png', 'tread_png', 'tyrewall_png']),
    // These materials are wheel-only. Keep the threshold low so the inboard
    // rim/tread vertices join the same rigid pivot instead of staying behind
    // and making the front tyres look pinched inward while steering.
    lateralMinRatio: 0.05,
    longitudinalMinRatio: 0.08,
  },
}
let dracoLoader: DRACOLoader | null = null

function makeMaterialInteriorVisible(material: THREE.Material): void {
  if (material.side !== THREE.DoubleSide) {
    material.side = THREE.DoubleSide
    material.needsUpdate = true
  }
}

function sharpenCarTextures(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  })
  for (const texture of textures) {
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.anisotropy = Math.max(texture.anisotropy, 8)
    texture.needsUpdate = true
  }
}

function prepareMeshForInteriorCamera(mesh: THREE.Mesh): void {
  mesh.frustumCulled = false
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of materials) {
    if (material) makeMaterialInteriorVisible(material)
  }
}

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderConfig({ type: 'js' })
    dracoLoader.setWorkerLimit(1)
    ;(dracoLoader as unknown as {
      _loadLibrary: (url: string, responseType: string) => Promise<string | ArrayBuffer>
    })._loadLibrary = async (url: string) => {
      if (url.endsWith('draco_decoder.js')) return dracoDecoderJs
      throw new Error(`Unsupported Draco decoder asset: ${url}`)
    }
  }
  return dracoLoader
}

interface PlaceholderRefs {
  group: THREE.Group
  wheels: THREE.Mesh[]
  bodyMat: THREE.MeshPhysicalMaterial
  accentMat: THREE.MeshPhysicalMaterial
  tireMat: THREE.MeshStandardMaterial
  geos: THREE.BufferGeometry[]
}

export interface PlayerWheelPivotRef {
  pivot: THREE.Group
  baseQuaternion: THREE.Quaternion
}

export interface PlayerWheelRig {
  name: string
  steerable: boolean
  steerPivot: PlayerWheelPivotRef
  spinPivots: PlayerWheelPivotRef[]
  spinAxis: THREE.Vector3
  spin: number
  baseCenterWorld?: THREE.Vector3
  steerComposition?: 'multiply' | 'premultiply'
}

interface SteerOnlyRig {
  name: string
  steerPivot: PlayerWheelPivotRef
}

function buildPlaceholder(): PlaceholderRefs {
  const group = new THREE.Group()
  group.name = 'car-placeholder'

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: '#dc0000',
    metalness: 0.9,
    roughness: 0.3,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  })
  const accentMat = new THREE.MeshPhysicalMaterial({
    color: '#181818',
    metalness: 0.6,
    roughness: 0.4,
  })
  const tireMat = new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.95 })

  const geos: THREE.BufferGeometry[] = []
  const addMesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot?: [number, number, number],
  ): THREE.Mesh => {
    geos.push(geo)
    const m = new THREE.Mesh(geo, mat)
    m.position.set(...pos)
    if (rot) m.rotation.set(...rot)
    m.castShadow = true
    prepareMeshForInteriorCamera(m)
    group.add(m)
    return m
  }

  addMesh(new THREE.BoxGeometry(1.6, 0.35, 4.4), bodyMat, [0, 0.35, 0])
  addMesh(new THREE.TorusGeometry(0.55, 0.05, 8, 24, Math.PI), accentMat, [0, 0.85, 0], [Math.PI / 2, 0, 0])
  addMesh(new THREE.SphereGeometry(0.28, 12, 10), accentMat, [0, 0.85, 0.1])
  addMesh(new THREE.ConeGeometry(0.4, 1.4, 8), bodyMat, [0, 0.4, 2.6], [Math.PI / 2, 0, 0])
  addMesh(new THREE.BoxGeometry(2.0, 0.06, 0.4), bodyMat, [0, 0.18, 2.4])
  addMesh(new THREE.BoxGeometry(1.6, 0.6, 0.08), bodyMat, [0, 0.95, -2.0])
  addMesh(new THREE.BoxGeometry(0.05, 0.5, 0.4), accentMat, [0, 0.6, -1.85])

  const wheels: THREE.Mesh[] = []
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 16)
  geos.push(wheelGeo)
  for (const [x, z] of [
    [-0.95, 1.6],
    [0.95, 1.6],
    [-0.95, -1.6],
    [0.95, -1.6],
  ] as [number, number][]) {
    const w = new THREE.Mesh(wheelGeo, tireMat)
    w.rotation.z = Math.PI / 2
    w.position.set(x, 0.45, z)
    w.castShadow = true
    prepareMeshForInteriorCamera(w)
    wheels.push(w)
    group.add(w)
  }

  return { group, wheels, bodyMat, accentMat, tireMat, geos }
}

function disposePlaceholder(refs: PlaceholderRefs): void {
  for (const g of refs.geos) g.dispose()
  refs.bodyMat.dispose()
  refs.accentMat.dispose()
  refs.tireMat.dispose()
}

function partNumberFromName(name: string): number | null {
  const match = name.toLowerCase().match(/(?:^|[_\-\s])(?:tripo_)?part_?(\d+)(?:$|[_\-\s])/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

function collectPartObjects(root: THREE.Object3D, partNumbers: readonly number[]): THREE.Object3D[] {
  const wanted = new Set(partNumbers)
  const raw: THREE.Object3D[] = []
  root.traverse((obj) => {
    const part = partNumberFromName(obj.name)
    if (part !== null && wanted.has(part)) raw.push(obj)
  })

  const rawSet = new Set(raw)
  return raw.filter((obj) => {
    let parent = obj.parent
    while (parent) {
      if (rawSet.has(parent)) return false
      parent = parent.parent
    }
    return true
  })
}

function collectFrontWheelStaticObjects(root: THREE.Object3D, partNumbers: readonly number[]): THREE.Object3D[] {
  const wanted = new Set(partNumbers)
  const objects: THREE.Object3D[] = []
  root.traverse((obj) => {
    const part = typeof obj.userData.frontWheelStaticPart === 'number'
      ? obj.userData.frontWheelStaticPart as number
      : null
    if (part !== null && wanted.has(part)) objects.push(obj)
  })
  return objects
}

function expandRenderedGeometryBox(box: THREE.Box3, mesh: THREE.Mesh): boolean {
  const position = mesh.geometry.getAttribute('position')
  if (!position) return false

  const index = mesh.geometry.index
  const total = index ? index.count : position.count
  const start = Math.max(0, mesh.geometry.drawRange.start || 0)
  const drawCount = Number.isFinite(mesh.geometry.drawRange.count)
    ? mesh.geometry.drawRange.count
    : total
  const end = Math.min(total, start + drawCount)
  const point = new THREE.Vector3()
  for (let i = start; i < end; i++) {
    const vertexIndex = index ? index.getX(i) : i
    point.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld)
    box.expandByPoint(point)
  }
  return true
}

function renderedBoxForObjects(objects: THREE.Object3D[]): THREE.Box3 {
  const box = new THREE.Box3()
  for (const obj of objects) {
    obj.updateMatrixWorld(true)
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) expandRenderedGeometryBox(box, mesh)
    })
  }
  return box
}

function smallestEigenvectorForSymmetricMatrix(
  matrix: number[][],
): THREE.Vector3 {
  const covariance = matrix.map((row) => [...row])
  const eigenvectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let iteration = 0; iteration < 24; iteration++) {
    let p = 0
    let q = 1
    let largest = Math.abs(covariance[0][1])
    for (const [row, col] of [[0, 2], [1, 2]] as const) {
      const value = Math.abs(covariance[row][col])
      if (value > largest) {
        largest = value
        p = row
        q = col
      }
    }
    if (largest < 1e-12) break
    const angle = 0.5 * Math.atan2(
      2 * covariance[p][q],
      covariance[q][q] - covariance[p][p],
    )
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const app = covariance[p][p]
    const aqq = covariance[q][q]
    const apq = covariance[p][q]
    covariance[p][p] = cos * cos * app - 2 * sin * cos * apq + sin * sin * aqq
    covariance[q][q] = sin * sin * app + 2 * sin * cos * apq + cos * cos * aqq
    covariance[p][q] = 0
    covariance[q][p] = 0
    for (let index = 0; index < 3; index++) {
      if (index === p || index === q) continue
      const aip = covariance[index][p]
      const aiq = covariance[index][q]
      covariance[index][p] = covariance[p][index] = cos * aip - sin * aiq
      covariance[index][q] = covariance[q][index] = sin * aip + cos * aiq
    }
    for (let row = 0; row < 3; row++) {
      const vip = eigenvectors[row][p]
      const viq = eigenvectors[row][q]
      eigenvectors[row][p] = cos * vip - sin * viq
      eigenvectors[row][q] = sin * vip + cos * viq
    }
  }
  let smallest = 0
  if (covariance[1][1] < covariance[smallest][smallest]) smallest = 1
  if (covariance[2][2] < covariance[smallest][smallest]) smallest = 2
  return new THREE.Vector3(
    eigenvectors[0][smallest],
    eigenvectors[1][smallest],
    eigenvectors[2][smallest],
  ).normalize()
}

function smallestPrincipalAxisForObjects(objects: THREE.Object3D[]): THREE.Vector3 {
  const points: THREE.Vector3[] = []
  const point = new THREE.Vector3()
  for (const obj of objects) {
    obj.updateMatrixWorld(true)
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const position = mesh.geometry.getAttribute('position')
      if (!position) return
      const stride = Math.max(1, Math.ceil(position.count / 6000))
      for (let index = 0; index < position.count; index += stride) {
        points.push(point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld).clone())
      }
    })
  }
  if (points.length < 3) return new THREE.Vector3(1, 0, 0)

  const mean = new THREE.Vector3()
  for (const sample of points) mean.add(sample)
  mean.multiplyScalar(1 / points.length)
  const covariance = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const sample of points) {
    const x = sample.x - mean.x
    const y = sample.y - mean.y
    const z = sample.z - mean.z
    covariance[0][0] += x * x
    covariance[0][1] += x * y
    covariance[0][2] += x * z
    covariance[1][1] += y * y
    covariance[1][2] += y * z
    covariance[2][2] += z * z
  }
  covariance[1][0] = covariance[0][1]
  covariance[2][0] = covariance[0][2]
  covariance[2][1] = covariance[1][2]

  const axis = smallestEigenvectorForSymmetricMatrix(covariance)
  if (axis.x < 0) axis.negate()
  return Math.abs(axis.x) >= 0.55 ? axis : new THREE.Vector3(1, 0, 0)
}

function cylinderAxisFromSurfaceGeometry(
  objects: THREE.Object3D[],
): THREE.Vector3 | null {
  const covariance = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const edgeAB = new THREE.Vector3()
  const edgeAC = new THREE.Vector3()
  const normal = new THREE.Vector3()
  let totalArea = 0

  for (const object of objects) {
    object.updateMatrixWorld(true)
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const position = mesh.geometry.getAttribute('position')
      if (!position) return
      const index = mesh.geometry.index
      const total = index?.count ?? position.count
      for (let offset = 0; offset + 2 < total; offset += 3) {
        a.fromBufferAttribute(position, index ? index.getX(offset) : offset)
          .applyMatrix4(mesh.matrixWorld)
        b.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1)
          .applyMatrix4(mesh.matrixWorld)
        c.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2)
          .applyMatrix4(mesh.matrixWorld)
        edgeAB.subVectors(b, a)
        edgeAC.subVectors(c, a)
        normal.crossVectors(edgeAB, edgeAC)
        const doubledArea = normal.length()
        if (doubledArea < 1e-10) continue
        normal.multiplyScalar(1 / doubledArea)
        const weight = doubledArea
        covariance[0][0] += weight * normal.x * normal.x
        covariance[0][1] += weight * normal.x * normal.y
        covariance[0][2] += weight * normal.x * normal.z
        covariance[1][1] += weight * normal.y * normal.y
        covariance[1][2] += weight * normal.y * normal.z
        covariance[2][2] += weight * normal.z * normal.z
        totalArea += weight
      }
    })
  }
  if (totalArea < 1e-8) return null
  covariance[1][0] = covariance[0][1]
  covariance[2][0] = covariance[0][2]
  covariance[2][1] = covariance[1][2]
  const axis = smallestEigenvectorForSymmetricMatrix(covariance)
  if (axis.x < 0) axis.negate()
  return Math.abs(axis.x) >= 0.55 ? axis : null
}

function areaWeightedSidewallAxisForObjects(
  objects: THREE.Object3D[],
): THREE.Vector3 | null {
  const axis = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const edgeAB = new THREE.Vector3()
  const edgeAC = new THREE.Vector3()
  const normal = new THREE.Vector3()
  let totalWeight = 0

  for (const object of objects) {
    object.updateMatrixWorld(true)
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const position = mesh.geometry.getAttribute('position')
      if (!position) return
      const index = mesh.geometry.index
      const total = index?.count ?? position.count
      for (let offset = 0; offset + 2 < total; offset += 3) {
        a.fromBufferAttribute(position, index ? index.getX(offset) : offset)
          .applyMatrix4(mesh.matrixWorld)
        b.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1)
          .applyMatrix4(mesh.matrixWorld)
        c.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2)
          .applyMatrix4(mesh.matrixWorld)
        edgeAB.subVectors(b, a)
        edgeAC.subVectors(c, a)
        normal.crossVectors(edgeAB, edgeAC)
        const doubledArea = normal.length()
        if (doubledArea < 1e-10) continue
        normal.multiplyScalar(1 / doubledArea)
        if (normal.x < 0) normal.negate()
        const lateralAlignment = Math.abs(normal.x)
        if (lateralAlignment < 0.55) continue
        const weight = doubledArea * lateralAlignment ** 4
        axis.addScaledVector(normal, weight)
        totalWeight += weight
      }
    })
  }
  if (totalWeight < 1e-8 || axis.lengthSq() < 1e-12) return null
  return axis.normalize()
}

function fittedWheelCenterForObjects(
  objects: THREE.Object3D[],
  axleWorld: THREE.Vector3,
  fallback: THREE.Vector3,
): THREE.Vector3 {
  if (!objects.length) return fallback.clone()
  const axle = axleWorld.clone().normalize()
  const radialUp = new THREE.Vector3(0, 1, 0)
    .addScaledVector(axle, -axle.y)
    .normalize()
  if (radialUp.lengthSq() < 1e-8) radialUp.set(0, 0, 1)
  const radialForward = new THREE.Vector3()
    .crossVectors(axle, radialUp)
    .normalize()
  const point = new THREE.Vector3()
  const seen = new Set<string>()
  let uu = 0
  let uv = 0
  let vv = 0
  let u = 0
  let v = 0
  let ur2 = 0
  let vr2 = 0
  let r2 = 0
  let axialMin = Number.POSITIVE_INFINITY
  let axialMax = Number.NEGATIVE_INFINITY
  let count = 0

  for (const object of objects) {
    object.updateMatrixWorld(true)
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      const position = mesh.geometry.getAttribute('position')
      if (!position) return
      const index = mesh.geometry.index
      const total = index?.count ?? position.count
      for (let offset = 0; offset < total; offset++) {
        point.fromBufferAttribute(position, index ? index.getX(offset) : offset)
          .applyMatrix4(mesh.matrixWorld)
        const key = `${Math.round(point.x * 100000)}:${Math.round(point.y * 100000)}:${Math.round(point.z * 100000)}`
        if (seen.has(key)) continue
        seen.add(key)
        const projectedU = point.dot(radialUp)
        const projectedV = point.dot(radialForward)
        const axial = point.dot(axle)
        const radiusSquared = projectedU * projectedU + projectedV * projectedV
        uu += 4 * projectedU * projectedU
        uv += 4 * projectedU * projectedV
        vv += 4 * projectedV * projectedV
        u += 2 * projectedU
        v += 2 * projectedV
        ur2 += 2 * projectedU * radiusSquared
        vr2 += 2 * projectedV * radiusSquared
        r2 += radiusSquared
        axialMin = Math.min(axialMin, axial)
        axialMax = Math.max(axialMax, axial)
        count += 1
      }
    })
  }
  if (count < 12) return fallback.clone()
  const normal = new THREE.Matrix3().set(
    uu, uv, u,
    uv, vv, v,
    u, v, count,
  )
  if (Math.abs(normal.determinant()) < 1e-9) return fallback.clone()
  const solution = new THREE.Vector3(ur2, vr2, r2).applyMatrix3(normal.invert())
  if (!Number.isFinite(solution.x) || !Number.isFinite(solution.y)) return fallback.clone()
  return new THREE.Vector3()
    .addScaledVector(radialUp, solution.x)
    .addScaledVector(radialForward, solution.y)
    .addScaledVector(axle, (axialMin + axialMax) * 0.5)
}

function renderedLocalBoxForMesh(mesh: THREE.Mesh): THREE.Box3 {
  const box = new THREE.Box3()
  const position = mesh.geometry.getAttribute('position')
  if (!position) return box
  const index = mesh.geometry.index
  const total = index ? index.count : position.count
  const point = new THREE.Vector3()
  for (let i = 0; i < total; i++) {
    point.fromBufferAttribute(position, index ? index.getX(i) : i)
    box.expandByPoint(point)
  }
  return box
}

function buildTriangleSubsetGeometry(
  source: THREE.BufferGeometry,
  triangleStarts: number[],
): THREE.BufferGeometry | null {
  const index = source.index
  const position = source.getAttribute('position')
  if (!position || triangleStarts.length === 0) return null

  const attrNames = Object.keys(source.attributes)
  const buffers = new Map<string, number[]>()
  for (const name of attrNames) buffers.set(name, [])

  const pushVertex = (vertexIndex: number): void => {
    for (const name of attrNames) {
      const attr = source.getAttribute(name) as THREE.BufferAttribute
      const target = buffers.get(name)
      if (!target) continue
      for (let k = 0; k < attr.itemSize; k++) target.push(attr.getComponent(vertexIndex, k))
    }
  }

  for (const triStart of triangleStarts) {
    for (let j = 0; j < 3; j++) {
      pushVertex(index ? index.getX(triStart + j) : triStart + j)
    }
  }

  const geometry = new THREE.BufferGeometry()
  for (const name of attrNames) {
    const sourceAttr = source.getAttribute(name) as THREE.BufferAttribute
    const values = buffers.get(name)
    if (!values) continue
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, sourceAttr.itemSize, sourceAttr.normalized))
  }
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function splitRedBullWheelComponents(root: THREE.Object3D): RedBullWheelComponents {
  const rolling = new Map<RedBullWheelSlot, THREE.Object3D[]>([
    ['left-front', []], ['right-front', []], ['left-rear', []], ['right-rear', []],
  ])
  const steering = new Map<RedBullWheelSlot, THREE.Object3D[]>([
    ['left-front', []], ['right-front', []], ['left-rear', []], ['right-rear', []],
  ])
  root.updateMatrixWorld(true)
  const candidates: THREE.Mesh[] = []
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry || !mesh.parent) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (materials.some((material) => {
      const name = (material?.name ?? '').toLowerCase()
      return RED_BULL_WHEEL_MATERIALS.has(name) || RED_BULL_WHEEL_AERO_SOURCE_MATERIALS.has(name)
    })) candidates.push(mesh)
  })

  const point = new THREE.Vector3()
  for (const mesh of candidates) {
    const position = mesh.geometry.getAttribute('position')
    const parent = mesh.parent
    if (!position || !parent) continue
    const index = mesh.geometry.index
    const total = index?.count ?? position.count
    const materialNames = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .map((material) => (material?.name ?? '').toLowerCase())
    const extractWholeMesh = materialNames.some((name) => RED_BULL_WHEEL_MATERIALS.has(name))
    const triangleStarts = new Map<RedBullWheelSlot, number[]>([
      ['left-front', []], ['right-front', []], ['left-rear', []], ['right-rear', []],
    ])
    const staticTriangles: number[] = []

    if (extractWholeMesh) {
      for (let offset = 0; offset + 2 < total; offset += 3) {
        let x = 0
        let z = 0
        for (let vertex = 0; vertex < 3; vertex++) {
          point.fromBufferAttribute(position, index ? index.getX(offset + vertex) : offset + vertex)
            .applyMatrix4(mesh.matrixWorld)
          x += point.x
          z += point.z
        }
        const side = x / 3 < 0 ? 'left' : 'right'
        const axle = z / 3 > -0.3 ? 'front' : 'rear'
        triangleStarts.get(`${side}-${axle}`)?.push(offset)
      }
    } else {
      for (const component of triangleComponents(mesh.geometry)) {
        const box = new THREE.Box3()
        for (const offset of component) {
          for (let vertex = 0; vertex < 3; vertex++) {
            point.fromBufferAttribute(position, index ? index.getX(offset + vertex) : offset + vertex)
              .applyMatrix4(mesh.matrixWorld)
            box.expandByPoint(point)
          }
        }
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const axle: 'front' | 'rear' = Math.abs(center.z - 1.289) < Math.abs(center.z + 1.921)
          ? 'front'
          : 'rear'
        const nearWheel = axle === 'front'
          && Math.abs(Math.abs(center.x) - 0.584) < 0.055
          && Math.abs(center.y - 0.476) < 0.06
          && Math.abs(center.z - 1.274) < 0.06
          && size.x > 0.12
          && size.x < 0.21
          && size.y > 0.55
          && size.y < 0.7
          && size.z > 0.55
          && size.z < 0.7
        if (nearWheel) {
          const side = center.x < 0 ? 'left' : 'right'
          triangleStarts.get(`${side}-${axle}`)?.push(...component)
        } else staticTriangles.push(...component)
      }
    }

    for (const [slot, starts] of triangleStarts) {
      const geometry = buildTriangleSubsetGeometry(mesh.geometry, starts)
      if (!geometry) continue
      const component = new THREE.Mesh(geometry, mesh.material)
      component.name = `redbull-wheel-${slot}-${mesh.name}`
      component.position.copy(mesh.position)
      component.quaternion.copy(mesh.quaternion)
      component.scale.copy(mesh.scale)
      component.castShadow = mesh.castShadow
      component.receiveShadow = mesh.receiveShadow
      component.frustumCulled = mesh.frustumCulled
      component.userData.redBullWheelSlot = slot
      component.userData.redBullWheelMaterials = materialNames
      parent.add(component)
      ;(extractWholeMesh ? rolling : steering).get(slot)?.push(component)
    }
    if (extractWholeMesh) {
      parent.remove(mesh)
      mesh.geometry.dispose()
    } else {
      const staticGeometry = buildTriangleSubsetGeometry(mesh.geometry, staticTriangles)
      if (staticGeometry) {
        const previousGeometry = mesh.geometry
        mesh.geometry = staticGeometry
        previousGeometry.dispose()
      }
    }
  }
  root.updateMatrixWorld(true)
  return { rolling, steering }
}

interface WheelMeshSplitOptions {
  partNumbers: readonly number[]
  shellRatio: number
  innerSideMargin: number
  staticNamePrefix: string
  staticUserDataKey?: string
  minRollingComponentTriangles?: number
  excludeOuterFaceCover?: boolean
}

function triangleVertexKey(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertexIndex: number,
  target: THREE.Vector3,
): string {
  target.fromBufferAttribute(position, vertexIndex)
  return `${Math.round(target.x * 100000)}:${Math.round(target.y * 100000)}:${Math.round(target.z * 100000)}`
}

function triangleComponentSizes(geometry: THREE.BufferGeometry): number[] {
  const position = geometry.getAttribute('position')
  if (!position) return []
  const index = geometry.index
  const total = index ? index.count : position.count
  const triCount = Math.floor(total / 3)
  const vertexToTriangles = new Map<string | number, number[]>()
  const triangleKeys: Array<Array<string | number>> = []
  const point = new THREE.Vector3()

  for (let tri = 0; tri < triCount; tri++) {
    const keys: Array<string | number> = []
    for (let j = 0; j < 3; j++) {
      const rawVertex = tri * 3 + j
      const vertexIndex = index ? index.getX(rawVertex) : rawVertex
      const key = index ? vertexIndex : triangleVertexKey(position, vertexIndex, point)
      keys.push(key)
      const bucket = vertexToTriangles.get(key)
      if (bucket) bucket.push(tri)
      else vertexToTriangles.set(key, [tri])
    }
    triangleKeys[tri] = keys
  }

  const seen = new Uint8Array(triCount)
  const sizes = new Array<number>(triCount).fill(0)
  for (let tri = 0; tri < triCount; tri++) {
    if (seen[tri]) continue
    const stack = [tri]
    const component: number[] = []
    seen[tri] = 1
    while (stack.length) {
      const current = stack.pop()
      if (current === undefined) continue
      component.push(current)
      for (const key of triangleKeys[current]) {
        const neighbors = vertexToTriangles.get(key)
        if (!neighbors) continue
        for (const next of neighbors) {
          if (seen[next]) continue
          seen[next] = 1
          stack.push(next)
        }
      }
    }
    for (const item of component) sizes[item] = component.length
  }
  return sizes
}

function triangleComponents(geometry: THREE.BufferGeometry): number[][] {
  const position = geometry.getAttribute('position')
  if (!position) return []
  const index = geometry.index
  const total = index?.count ?? position.count
  const triangleCount = Math.floor(total / 3)
  const vertexToTriangles = new Map<string | number, number[]>()
  const triangleKeys: Array<Array<string | number>> = []
  const point = new THREE.Vector3()
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const keys: Array<string | number> = []
    for (let vertex = 0; vertex < 3; vertex++) {
      const rawVertex = triangle * 3 + vertex
      const vertexIndex = index ? index.getX(rawVertex) : rawVertex
      const key = index ? vertexIndex : triangleVertexKey(position, vertexIndex, point)
      keys.push(key)
      const bucket = vertexToTriangles.get(key)
      if (bucket) bucket.push(triangle)
      else vertexToTriangles.set(key, [triangle])
    }
    triangleKeys.push(keys)
  }
  const seen = new Uint8Array(triangleCount)
  const components: number[][] = []
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    if (seen[triangle]) continue
    const stack = [triangle]
    const component: number[] = []
    seen[triangle] = 1
    while (stack.length) {
      const current = stack.pop()
      if (current === undefined) continue
      component.push(current * 3)
      for (const key of triangleKeys[current]) {
        for (const next of vertexToTriangles.get(key) ?? []) {
          if (seen[next]) continue
          seen[next] = 1
          stack.push(next)
        }
      }
    }
    components.push(component)
  }
  return components
}

function splitWheelRollingMeshes(root: THREE.Object3D, options: WheelMeshSplitOptions): void {
  const parts = collectPartObjects(root, options.partNumbers)
  for (const obj of parts) {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) continue
    const position = mesh.geometry.getAttribute('position')
    if (!position) continue

    const localBox = renderedLocalBoxForMesh(mesh)
    if (localBox.isEmpty()) continue
    const partNumber = partNumberFromName(mesh.name)
    const center = localBox.getCenter(new THREE.Vector3())
    const size = localBox.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y) * 0.5
    const shellThreshold = radius * options.shellRatio
    const lateralSign = Math.sign(center.z) || 1
    const innerSideLimit = -size.z * options.innerSideMargin
    const index = mesh.geometry.index
    const total = index ? index.count : position.count
    const rollingTriangles: number[] = []
    const staticTriangles: number[] = []
    const componentSizes = options.minRollingComponentTriangles
      ? triangleComponentSizes(mesh.geometry)
      : []
    const v = new THREE.Vector3()

    for (let i = 0; i + 2 < total; i += 3) {
      let radial = 0
      let lateral = 0
      for (let j = 0; j < 3; j++) {
        v.fromBufferAttribute(position, index ? index.getX(i + j) : i + j)
        radial += Math.hypot(v.x - center.x, v.y - center.y)
        lateral += v.z
      }
      radial /= 3
      lateral /= 3
      const triangleIndex = Math.floor(i / 3)
      const componentCanRoll = !options.minRollingComponentTriangles ||
        (componentSizes[triangleIndex] ?? 0) >= options.minRollingComponentTriangles
      const outerOrCenter = lateralSign * (lateral - center.z) >= innerSideLimit
      const outerFaceCover = options.excludeOuterFaceCover === true &&
        lateralSign * (lateral - center.z) > size.z * 0.32 &&
        radial < radius * 0.76
      if (componentCanRoll && radial >= shellThreshold && outerOrCenter && !outerFaceCover) rollingTriangles.push(i)
      else staticTriangles.push(i)
    }

    const rollingGeometry = buildTriangleSubsetGeometry(mesh.geometry, rollingTriangles)
    const staticGeometry = buildTriangleSubsetGeometry(mesh.geometry, staticTriangles)
    if (!rollingGeometry || !staticGeometry || !mesh.parent) {
      rollingGeometry?.dispose()
      staticGeometry?.dispose()
      continue
    }

    const rollingMesh = new THREE.Mesh(rollingGeometry, mesh.material)
    rollingMesh.name = `${mesh.name}_rolling`
    rollingMesh.position.copy(mesh.position)
    rollingMesh.quaternion.copy(mesh.quaternion)
    rollingMesh.scale.copy(mesh.scale)
    rollingMesh.castShadow = mesh.castShadow
    rollingMesh.receiveShadow = mesh.receiveShadow
    rollingMesh.frustumCulled = mesh.frustumCulled

    const staticMesh = new THREE.Mesh(staticGeometry, mesh.material)
    staticMesh.name = `${options.staticNamePrefix}-${mesh.id}`
    if (options.staticUserDataKey && partNumber !== null) {
      staticMesh.userData[options.staticUserDataKey] = partNumber
    }
    staticMesh.position.copy(mesh.position)
    staticMesh.quaternion.copy(mesh.quaternion)
    staticMesh.scale.copy(mesh.scale)
    staticMesh.castShadow = mesh.castShadow
    staticMesh.receiveShadow = mesh.receiveShadow
    staticMesh.frustumCulled = mesh.frustumCulled

    const parent = mesh.parent
    parent.add(staticMesh)
    parent.add(rollingMesh)
    parent.remove(mesh)
    mesh.geometry.dispose()
  }
}

function splitFrontWheelRollingMeshes(root: THREE.Object3D): void {
  splitWheelRollingMeshes(root, {
    partNumbers: FRONT_WHEEL_SPLIT_PARTS,
    shellRatio: FRONT_WHEEL_ROLL_SHELL_RATIO,
    innerSideMargin: FRONT_WHEEL_INNER_SIDE_MARGIN,
    staticNamePrefix: 'front-wheel-static',
    staticUserDataKey: 'frontWheelStaticPart',
    minRollingComponentTriangles: 256,
    excludeOuterFaceCover: true,
  })
}

function splitRearWheelRollingMeshes(root: THREE.Object3D): void {
  splitWheelRollingMeshes(root, {
    partNumbers: REAR_WHEEL_SPLIT_PARTS,
    shellRatio: REAR_WHEEL_ROLL_SHELL_RATIO,
    innerSideMargin: REAR_WHEEL_INNER_SIDE_MARGIN,
    staticNamePrefix: 'rear-wheel-static',
  })
}

function createPivotForObjects(
  root: THREE.Object3D,
  objects: THREE.Object3D[],
  name: string,
  centerWorldOverride?: THREE.Vector3,
): PlayerWheelPivotRef | null {
  if (!objects.length) return null
  root.updateMatrixWorld(true)
  const box = renderedBoxForObjects(objects)
  if (box.isEmpty()) return null

  const centerWorld = centerWorldOverride ?? box.getCenter(new THREE.Vector3())
  const pivot = new THREE.Group()
  pivot.name = name
  pivot.position.copy(root.worldToLocal(centerWorld.clone()))
  root.add(pivot)
  root.updateMatrixWorld(true)
  for (const obj of objects) pivot.attach(obj)
  pivot.updateMatrixWorld(true)
  return { pivot, baseQuaternion: pivot.quaternion.clone() }
}

function wheelCenterForParts(parts: THREE.Object3D[]): THREE.Vector3 {
  const box = renderedBoxForObjects(parts)
  const boxCenter = box.getCenter(new THREE.Vector3())
  if (parts.length !== 1) return boxCenter

  // The simplified GLB keeps the wheel pivot on each part node. Prefer that
  // authored origin when it sits inside the wheel geometry; a few exported
  // parts have their origin at the model root, so keep the bbox fallback for
  // those malformed nodes.
  const authoredCenter = parts[0].getWorldPosition(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const tolerance = Math.max(size.x, size.y) * 0.9 + 0.02
  if (authoredCenter.distanceTo(boxCenter) <= tolerance) return authoredCenter
  return boxCenter
}

function createWheelRig(
  root: THREE.Object3D,
  name: string,
  steerPartNumbers: readonly number[],
  spinPartNumbers: readonly number[],
  steerable: boolean,
  sharedSpinCenter: boolean,
  spinAxis = WHEEL_SPIN_AXIS,
): PlayerWheelRig | null {
  const steerParts = [
    ...collectPartObjects(root, steerPartNumbers),
    ...collectFrontWheelStaticObjects(root, steerPartNumbers),
  ]
  const spinParts = collectPartObjects(root, spinPartNumbers)
  const centerParts = spinParts.length ? spinParts : steerParts
  const centerBox = renderedBoxForObjects(centerParts)
  if (centerBox.isEmpty()) return null
  const wheelCenterWorld = wheelCenterForParts(centerParts)
  const steerPivot = createPivotForObjects(root, steerParts, `player-${name}-steer-pivot`, wheelCenterWorld)
  if (!steerPivot) return null

  const spinPivots = sharedSpinCenter
    ? [
        createPivotForObjects(
          steerPivot.pivot,
          spinParts,
          `player-${name}-spin-pivot`,
          wheelCenterWorld,
        ),
      ].filter((item): item is PlayerWheelPivotRef => Boolean(item))
    : spinParts
        .map((part, index) => createPivotForObjects(steerPivot.pivot, [part], `player-${name}-spin-pivot-${index}`))
        .filter((item): item is PlayerWheelPivotRef => Boolean(item))
  if (!spinPivots.length) return null

  return {
    name,
    steerable,
    steerPivot,
    spinPivots,
    spinAxis: spinAxis.clone(),
    spin: 0,
    baseCenterWorld: wheelCenterWorld.clone(),
  }
}

function createRedBullWheelRigs(root: THREE.Object3D): PlayerWheelRig[] {
  const wheelParts = splitRedBullWheelComponents(root)
  const rigs: PlayerWheelRig[] = []
  const axlePartsBySlot = new Map<RedBullWheelSlot, THREE.Object3D[]>()
  const wheelCenters = new Map<RedBullWheelSlot, THREE.Vector3>()
  for (const [name, rollingParts] of wheelParts.rolling) {
    const referenceMaterials = name.endsWith('-rear')
      ? RED_BULL_REAR_AXLE_REFERENCE_MATERIALS
      : RED_BULL_AXLE_REFERENCE_MATERIALS
    const referenceParts = rollingParts.filter((part) => {
      const materials = part.userData.redBullWheelMaterials as string[] | undefined
      return materials?.some((material) => referenceMaterials.has(material)) === true
    })
    const axleParts = referenceParts.length ? referenceParts : rollingParts
    axlePartsBySlot.set(name, axleParts)
    wheelCenters.set(name, renderedBoxForObjects(axleParts).getCenter(new THREE.Vector3()))
  }

  for (const [name, rollingParts] of wheelParts.rolling) {
    if (!rollingParts.length) continue
    const steeringParts = wheelParts.steering.get(name) ?? []
    const axleParts = axlePartsBySlot.get(name) ?? rollingParts
    // Each rear wheel keeps its own geometry-derived camber. The dedicated
    // rear reference set excludes the misleading REAR_RIMS principal axis.
    const axleWorld = smallestPrincipalAxisForObjects(axleParts)
    const wheelCenter = wheelCenters.get(name)?.clone()
      ?? renderedBoxForObjects(axleParts).getCenter(new THREE.Vector3())
    const steerPivot = createPivotForObjects(
      root,
      [...rollingParts, ...steeringParts],
      `player-${name}-steer-pivot`,
      wheelCenter,
    )
    if (!steerPivot) continue
    const spinPivot = createPivotForObjects(
      steerPivot.pivot,
      rollingParts,
      `player-${name}-spin-pivot`,
      wheelCenter,
    )
    if (!spinPivot) continue
    const pivotWorldQuaternion = spinPivot.pivot.getWorldQuaternion(new THREE.Quaternion())
    const axleLocal = axleWorld.clone().applyQuaternion(pivotWorldQuaternion.invert()).normalize()
    rigs.push({
      name,
      // Steering and rolling use separate nested pivots, so the detected
      // axle remains stable while the two front wheel assemblies yaw.
      steerable: name.endsWith('-front'),
      steerPivot,
      spinPivots: [spinPivot],
      spinAxis: axleLocal,
      spin: 0,
    })
  }
  return rigs
}

function createWheelRigsFromParts(
  root: THREE.Object3D,
  rolling: Map<PlayerWheelSlot, THREE.Object3D[]>,
  centers?: ReadonlyMap<PlayerWheelSlot, THREE.Vector3>,
  fixedWorldAxle?: THREE.Vector3 | ReadonlyMap<PlayerWheelSlot, THREE.Vector3>,
): PlayerWheelRig[] {
  const rigs: PlayerWheelRig[] = []
  for (const [name, rollingParts] of rolling) {
    if (!rollingParts.length) continue
    const axleOverride = fixedWorldAxle instanceof THREE.Vector3
      ? fixedWorldAxle
      : fixedWorldAxle?.get(name)
    const axleWorld = axleOverride?.clone().normalize()
      ?? smallestPrincipalAxisForObjects(rollingParts)
    const wheelCenter = centers?.get(name)?.clone()
      ?? wheelCenterForParts(rollingParts)
    const steerPivot = createPivotForObjects(
      root,
      rollingParts,
      `player-${name}-steer-pivot`,
      wheelCenter,
    )
    if (!steerPivot) continue
    const spinPivot = createPivotForObjects(
      steerPivot.pivot,
      rollingParts,
      `player-${name}-spin-pivot`,
      wheelCenter,
    )
    if (!spinPivot) continue
    const pivotWorldQuaternion = spinPivot.pivot.getWorldQuaternion(new THREE.Quaternion())
    const axleLocal = axleWorld.clone().applyQuaternion(pivotWorldQuaternion.invert()).normalize()
    rigs.push({
      name,
      steerable: name.endsWith('-front'),
      steerPivot,
      spinPivots: [spinPivot],
      spinAxis: axleLocal,
      spin: 0,
      baseCenterWorld: wheelCenter.clone(),
    })
  }
  return rigs
}

function mercedesWheelAnchorSlot(
  componentBox: THREE.Box3,
  modelBox: THREE.Box3,
): PlayerWheelSlot | null {
  const center = componentBox.getCenter(new THREE.Vector3())
  const size = componentBox.getSize(new THREE.Vector3())
  const modelCenter = modelBox.getCenter(new THREE.Vector3())
  const modelSize = modelBox.getSize(new THREE.Vector3())
  const x = center.x - modelCenter.x
  const z = center.z - modelCenter.z
  const lowEnough = center.y <= modelBox.min.y + modelSize.y * 0.58
  const farEnoughOut = Math.abs(x) >= modelSize.x * 0.27
  const nearAnAxle = Math.abs(z) >= modelSize.z * 0.17
  const axle: 'front' | 'rear' = z > 0 ? 'front' : 'rear'
  const radialRoundness = Math.min(size.y, size.z) / Math.max(size.y, size.z, 1e-6)
  const wheelSized = size.x <= modelSize.x * 0.36
    && size.y >= modelSize.y * 0.2
    && size.y <= modelSize.y * 0.82
    && size.z >= modelSize.z * 0.065
    && size.z <= modelSize.z * 0.24
    && size.y / Math.max(size.z, 1e-6) >= 0.5
    && size.y / Math.max(size.z, 1e-6) <= 1.8
  const frontTireSized = axle === 'rear'
    || (
      size.x >= modelSize.x * 0.075
      && size.y >= modelSize.y * 0.38
      && size.z >= modelSize.z * 0.1
      && radialRoundness >= 0.84
    )
  if (!lowEnough || !farEnoughOut || !nearAnAxle || !wheelSized || !frontTireSized) return null
  const side = x < 0 ? 'left' : 'right'
  return `${side}-${axle}` as PlayerWheelSlot
}

interface MercedesMeshComponent {
  mesh: THREE.Mesh
  triangleStarts: number[]
  box: THREE.Box3
  center: THREE.Vector3
  size: THREE.Vector3
  anchorSlot: PlayerWheelSlot | null
}

interface MercedesWheelComponents {
  rolling: Map<PlayerWheelSlot, THREE.Object3D[]>
  centers: Map<PlayerWheelSlot, THREE.Vector3>
  frontAxles: Map<PlayerWheelSlot, THREE.Vector3>
}

function fittedWheelCircleCenter(
  mesh: THREE.Mesh,
  triangleStarts: readonly number[],
  fallback: THREE.Vector3,
): THREE.Vector3 {
  const position = mesh.geometry.getAttribute('position')
  if (!position) return fallback.clone()
  const index = mesh.geometry.index
  const seen = new Set<number | string>()
  const point = new THREE.Vector3()
  let yy = 0
  let yz = 0
  let zz = 0
  let y = 0
  let z = 0
  let yr2 = 0
  let zr2 = 0
  let r2 = 0
  let count = 0

  for (const offset of triangleStarts) {
    for (let vertex = 0; vertex < 3; vertex++) {
      const vertexIndex = index ? index.getX(offset + vertex) : offset + vertex
      point.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld)
      const key = index
        ? vertexIndex
        : `${Math.round(point.x * 100000)}:${Math.round(point.y * 100000)}:${Math.round(point.z * 100000)}`
      if (seen.has(key)) continue
      seen.add(key)
      const radiusSquared = point.y * point.y + point.z * point.z
      yy += 4 * point.y * point.y
      yz += 4 * point.y * point.z
      zz += 4 * point.z * point.z
      y += 2 * point.y
      z += 2 * point.z
      yr2 += 2 * point.y * radiusSquared
      zr2 += 2 * point.z * radiusSquared
      r2 += radiusSquared
      count += 1
    }
  }

  if (count < 12) return fallback.clone()
  const normal = new THREE.Matrix3().set(
    yy, yz, y,
    yz, zz, z,
    y, z, count,
  )
  if (Math.abs(normal.determinant()) < 1e-9) return fallback.clone()
  const solution = new THREE.Vector3(yr2, zr2, r2).applyMatrix3(normal.invert())
  if (!Number.isFinite(solution.x) || !Number.isFinite(solution.y)) return fallback.clone()
  return new THREE.Vector3(fallback.x, solution.x, solution.y)
}

function splitMercedesWheelComponents(root: THREE.Object3D): MercedesWheelComponents {
  root.updateMatrixWorld(true)
  const modelBox = renderedBoxForObjects([root])
  const modelSize = modelBox.getSize(new THREE.Vector3())
  const rolling = new Map<PlayerWheelSlot, THREE.Object3D[]>([
    ['left-front', []],
    ['right-front', []],
    ['left-rear', []],
    ['right-rear', []],
  ])
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.isMesh && mesh.geometry && mesh.parent) meshes.push(mesh)
  })

  const components: MercedesMeshComponent[] = []
  const anchorBoxes = new Map<PlayerWheelSlot, THREE.Box3>([
    ['left-front', new THREE.Box3()],
    ['right-front', new THREE.Box3()],
    ['left-rear', new THREE.Box3()],
    ['right-rear', new THREE.Box3()],
  ])
  const frontTireAnchors = new Map<PlayerWheelSlot, {
    box: THREE.Box3
    score: number
    center: THREE.Vector3
    source: MercedesMeshComponent
  }>()
  const point = new THREE.Vector3()
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position')
    if (!position) continue
    const index = mesh.geometry.index
    for (const component of triangleComponents(mesh.geometry)) {
      const componentBox = new THREE.Box3()
      for (const offset of component) {
        for (let vertex = 0; vertex < 3; vertex++) {
          point.fromBufferAttribute(position, index ? index.getX(offset + vertex) : offset + vertex)
            .applyMatrix4(mesh.matrixWorld)
          componentBox.expandByPoint(point)
        }
      }
      const anchorSlot = mercedesWheelAnchorSlot(componentBox, modelBox)
      const record: MercedesMeshComponent = {
        mesh,
        triangleStarts: component,
        box: componentBox,
        center: componentBox.getCenter(new THREE.Vector3()),
        size: componentBox.getSize(new THREE.Vector3()),
        anchorSlot,
      }
      components.push(record)
      if (anchorSlot) {
        anchorBoxes.get(anchorSlot)?.union(componentBox)
        if (anchorSlot.endsWith('-front')) {
          const componentSize = componentBox.getSize(new THREE.Vector3())
          const roundness = Math.min(componentSize.y, componentSize.z)
            / Math.max(componentSize.y, componentSize.z, 1e-6)
          const score = componentSize.y * componentSize.z * roundness * roundness
          if (score > (frontTireAnchors.get(anchorSlot)?.score ?? -1)) {
            const boxCenter = componentBox.getCenter(new THREE.Vector3())
            frontTireAnchors.set(anchorSlot, {
              box: componentBox.clone(),
              score,
              center: fittedWheelCircleCenter(mesh, component, boxCenter),
              source: record,
            })
          }
        }
      }
    }
  }

  for (const slot of ['left-front', 'right-front'] as const) {
    const tireAnchor = frontTireAnchors.get(slot)
    if (!tireAnchor) continue
    const tireCenter = tireAnchor.box.getCenter(new THREE.Vector3())
    const tireSize = tireAnchor.box.getSize(new THREE.Vector3())
    const tireDiameter = Math.max(tireSize.y, tireSize.z)
    let bestHub: MercedesMeshComponent | null = null
    let bestScore = Number.POSITIVE_INFINITY
    for (const component of components) {
      const radialSize = Math.max(component.size.y, component.size.z)
      const radialRatio = radialSize / Math.max(tireDiameter, 1e-6)
      const roundness = Math.min(component.size.y, component.size.z)
        / Math.max(component.size.y, component.size.z, 1e-6)
      const dy = Math.abs(component.center.y - tireCenter.y) / Math.max(tireSize.y, 1e-6)
      const dz = Math.abs(component.center.z - tireCenter.z) / Math.max(tireSize.z, 1e-6)
      const insideAxleBand = component.center.x >= tireAnchor.box.min.x - tireSize.x * 0.25
        && component.center.x <= tireAnchor.box.max.x + tireSize.x * 0.25
      if (
        !insideAxleBand
        || dy > 0.2
        || dz > 0.2
        || radialRatio < 0.06
        || radialRatio > 0.42
        || roundness < 0.68
      ) continue
      const score = (dy + dz) * 8
        + Math.abs(radialRatio - 0.18)
        + (1 - roundness) * 0.5
      if (score < bestScore) {
        bestHub = component
        bestScore = score
      }
    }
    if (bestHub) tireAnchor.center.copy(bestHub.center)
  }

  const centers = new Map<PlayerWheelSlot, THREE.Vector3>()
  for (const [slot, box] of anchorBoxes) {
    if (box.isEmpty()) continue
    const frontTire = frontTireAnchors.get(slot)
    centers.set(
      slot,
      frontTire?.center.clone() ?? box.getCenter(new THREE.Vector3()),
    )
  }
  const leftFrontCenter = centers.get('left-front')
  const rightFrontCenter = centers.get('right-front')
  if (leftFrontCenter && rightFrontCenter) {
    // Both front wheels share one physical axle. Preserve each wheel's
    // lateral X position, while eliminating tiny exporter/component
    // differences that otherwise make one wheel rotate eccentrically.
    const axleY = (leftFrontCenter.y + rightFrontCenter.y) * 0.5
    const axleZ = (leftFrontCenter.z + rightFrontCenter.z) * 0.5
    leftFrontCenter.set(leftFrontCenter.x, axleY, axleZ)
    rightFrontCenter.set(rightFrontCenter.x, axleY, axleZ)
  }

  const frontSelectionAxles = new Map<PlayerWheelSlot, THREE.Vector3>()
  for (const slot of ['left-front', 'right-front'] as const) {
    const tireAnchor = frontTireAnchors.get(slot)
    if (!tireAnchor) continue
    const geometry = buildTriangleSubsetGeometry(
      tireAnchor.source.mesh.geometry,
      tireAnchor.source.triangleStarts,
    )
    if (!geometry) continue
    const reference = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    reference.matrixAutoUpdate = false
    reference.matrix.copy(tireAnchor.source.mesh.matrixWorld)
    reference.matrixWorld.copy(tireAnchor.source.mesh.matrixWorld)
    const axle = smallestPrincipalAxisForObjects([reference])
    const outward = slot === 'left-front'
      ? new THREE.Vector3(-1, 0, 0)
      : new THREE.Vector3(1, 0, 0)
    if (axle.dot(outward) < 0) axle.negate()
    frontSelectionAxles.set(slot, axle)
    geometry.dispose()
    ;(reference.material as THREE.Material).dispose()
  }

  const frontInnerSidewallPlanes = new Map<PlayerWheelSlot, {
    x: number
    tolerance: number
    outerAxis: THREE.Vector3
    outerAxial: number
    axialMin: number
    axialMax: number
    components: Set<MercedesMeshComponent>
    ringComponents: Set<MercedesMeshComponent>
  }>()
  for (const slot of ['left-front', 'right-front'] as const) {
    const tireAnchor = frontTireAnchors.get(slot)
    if (!tireAnchor) continue
    const tireSize = tireAnchor.box.getSize(new THREE.Vector3())
    const selectionAxle = frontSelectionAxles.get(slot)
      ?? new THREE.Vector3(slot === 'left-front' ? -1 : 1, 0, 0)
    const tireDiameter = Math.max(tireSize.y, tireSize.z)
    const innerRadius = tireDiameter * 0.24
    const outerRadius = tireDiameter * 0.6
    const sidewallMargin = Math.max(tireSize.x * 0.08, modelSize.x * 0.004)
    const sidewallXMin = slot === 'left-front'
      ? tireAnchor.box.max.x - tireSize.x * 0.58
      : tireAnchor.box.min.x - sidewallMargin
    const sidewallXMax = slot === 'left-front'
      ? tireAnchor.box.max.x + sidewallMargin
      : tireAnchor.box.min.x + tireSize.x * 0.58
    const binSize = Math.max(0.004, modelSize.x * 0.006)
    const bins = new Map<number, number>()
    const sidewallComponents = new Set<MercedesMeshComponent>()
    const ringComponents = new Set<MercedesMeshComponent>()
    const samplePoint = new THREE.Vector3()
    const sampleNormal = new THREE.Vector3()
    const sampleOffset = new THREE.Vector3()
    const radialUp = new THREE.Vector3(0, 1, 0)
      .addScaledVector(selectionAxle, -selectionAxle.y)
      .normalize()
    const radialForward = new THREE.Vector3()
      .crossVectors(selectionAxle, radialUp)
      .normalize()

    for (const component of components) {
      const position = component.mesh.geometry.getAttribute('position')
      const normal = component.mesh.geometry.getAttribute('normal')
      const index = component.mesh.geometry.index
      if (!position || !normal) continue
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(component.mesh.matrixWorld)
      const angleBins = new Set<number>()
      const fullRingAngleBins = new Set<number>()
      const componentSamples: number[] = []
      let ringTriangleCount = 0
      for (const triangleStart of component.triangleStarts) {
        let centroidX = 0
        let centroidY = 0
        let centroidZ = 0
        let normalAlignment = 0
        for (let vertex = 0; vertex < 3; vertex++) {
          const vertexIndex = index ? index.getX(triangleStart + vertex) : triangleStart + vertex
          samplePoint.fromBufferAttribute(position, vertexIndex).applyMatrix4(component.mesh.matrixWorld)
          sampleNormal.fromBufferAttribute(normal, vertexIndex).applyNormalMatrix(normalMatrix)
          centroidX += samplePoint.x
          centroidY += samplePoint.y
          centroidZ += samplePoint.z
          normalAlignment += Math.abs(sampleNormal.dot(selectionAxle))
        }
        centroidX /= 3
        centroidY /= 3
        centroidZ /= 3
        normalAlignment /= 3
        sampleOffset
          .set(centroidX, centroidY, centroidZ)
          .sub(tireAnchor.center)
        const axial = sampleOffset.dot(selectionAxle)
        sampleOffset.addScaledVector(selectionAxle, -axial)
        const radial = sampleOffset.length()
        const angle = Math.atan2(
          sampleOffset.dot(radialForward),
          sampleOffset.dot(radialUp),
        )
        const angleBin = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 16) % 16
        if (
          radial >= innerRadius
          && radial <= outerRadius
          && normalAlignment >= 0.55
        ) {
          fullRingAngleBins.add(angleBin)
          ringTriangleCount += 1
        }
        if (
          centroidX < sidewallXMin
          || centroidX > sidewallXMax
          || radial < innerRadius
          || radial > outerRadius
          || normalAlignment < 0.55
        ) {
          continue
        }
        angleBins.add(angleBin)
        componentSamples.push(centroidX)
      }
      const ringCoverage = ringTriangleCount
        / Math.max(component.triangleStarts.length, 1)
      if (fullRingAngleBins.size >= 12 && ringCoverage >= 0.55) {
        ringComponents.add(component)
      }
      // A tire sidewall wraps around almost the entire wheel. Wheel brows,
      // suspension fairings and other aero pieces only occupy a short arc.
      if (angleBins.size >= 9) {
        sidewallComponents.add(component)
        for (const centroidX of componentSamples) {
          const bin = Math.round(centroidX / binSize)
          bins.set(bin, (bins.get(bin) ?? 0) + 1)
        }
      }
    }

    let bestBin: number | null = null
    let bestCount = 0
    for (const [bin, count] of bins) {
      if (count > bestCount) {
        bestBin = bin
        bestCount = count
      }
    }
    const innerEdgeX = slot === 'left-front'
      ? tireAnchor.box.max.x
      : tireAnchor.box.min.x
    let axialMin = Number.POSITIVE_INFINITY
    let axialMax = Number.NEGATIVE_INFINITY
    const anchorPosition = tireAnchor.source.mesh.geometry.getAttribute('position')
    const anchorIndex = tireAnchor.source.mesh.geometry.index
    if (anchorPosition) {
      for (const triangleStart of tireAnchor.source.triangleStarts) {
        for (let vertex = 0; vertex < 3; vertex++) {
          const vertexIndex = anchorIndex
            ? anchorIndex.getX(triangleStart + vertex)
            : triangleStart + vertex
          samplePoint
            .fromBufferAttribute(anchorPosition, vertexIndex)
            .applyMatrix4(tireAnchor.source.mesh.matrixWorld)
          const axial = samplePoint.clone().sub(tireAnchor.center).dot(selectionAxle)
          axialMin = Math.min(axialMin, axial)
          axialMax = Math.max(axialMax, axial)
        }
      }
    }
    if (!Number.isFinite(axialMin) || !Number.isFinite(axialMax)) {
      axialMin = -tireSize.x * 0.5
      axialMax = tireSize.x * 0.5
    }
    frontInnerSidewallPlanes.set(slot, {
      x: bestBin === null ? innerEdgeX : bestBin * binSize,
      tolerance: Math.max(binSize * 1.25, modelSize.x * 0.006),
      outerAxis: selectionAxle.clone(),
      outerAxial: axialMax,
      axialMin,
      axialMax,
      components: sidewallComponents,
      ringComponents,
    })
  }

  const trianglesByMesh = new Map<THREE.Mesh, {
    staticTriangles: number[]
    wheelTriangles: Map<PlayerWheelSlot, number[]>
    frontAxleTriangles: Map<PlayerWheelSlot, number[]>
  }>()
  for (const mesh of meshes) {
    trianglesByMesh.set(mesh, {
      staticTriangles: [],
      wheelTriangles: new Map<PlayerWheelSlot, number[]>([
        ['left-front', []],
        ['right-front', []],
        ['left-rear', []],
        ['right-rear', []],
      ]),
      frontAxleTriangles: new Map<PlayerWheelSlot, number[]>([
        ['left-front', []],
        ['right-front', []],
      ]),
    })
  }

  for (const component of components) {
    const target = trianglesByMesh.get(component.mesh)
    if (!target) continue
    let slot: PlayerWheelSlot | null = null
    for (const candidateSlot of ['left-front', 'right-front'] as const) {
      const tireAnchor = frontTireAnchors.get(candidateSlot)
      if (!tireAnchor) continue
      const tireSize = tireAnchor.box.getSize(new THREE.Vector3())
      const tireCenter = tireAnchor.center
      const roundness = Math.min(component.size.y, component.size.z)
        / Math.max(component.size.y, component.size.z, 1e-6)
      const sameCenter = Math.abs(component.center.x - tireCenter.x) <= modelSize.x * 0.2
        && Math.abs(component.center.y - tireCenter.y) <= tireSize.y * 0.018
        && Math.abs(component.center.z - tireCenter.z) <= tireSize.z * 0.018
      const wheelDiameter = component.size.y >= tireSize.y * 0.02
        && component.size.z >= tireSize.z * 0.02
        && component.size.y <= tireSize.y * 1.04
        && component.size.z <= tireSize.z * 1.04
      const wheelWidth = component.size.x <= modelSize.x * 0.24
      const wheelSource = component === tireAnchor.source
        || (sameCenter && wheelDiameter && wheelWidth && roundness >= 0.5)
      const innerDepth = Math.max(tireSize.x * 0.8, modelSize.x * 0.18)
      const outerMargin = Math.max(tireSize.x * 0.12, modelSize.x * 0.025)
      const innerXMin = candidateSlot === 'left-front'
        ? tireAnchor.box.min.x - outerMargin
        : tireAnchor.box.min.x - innerDepth
      const innerXMax = candidateSlot === 'left-front'
        ? tireAnchor.box.max.x + innerDepth
        : tireAnchor.box.max.x + outerMargin
      const hubCentered = Math.abs(component.center.y - tireAnchor.center.y) <= tireSize.y * 0.08
        && Math.abs(component.center.z - tireAnchor.center.z) <= tireSize.z * 0.08
      const tireDiameter = Math.max(tireSize.y, tireSize.z)
      const hubRadialSize = Math.max(component.size.y, component.size.z)
      const hubRoundness = Math.min(component.size.y, component.size.z)
        / Math.max(hubRadialSize, 1e-6)
      const compactHub = component.size.x <= tireSize.x * 1.6
        && hubRadialSize >= tireDiameter * 0.04
        && hubRadialSize <= tireDiameter * 0.42
        && component.size.y <= tireSize.y * 0.52
        && component.size.z <= tireSize.z * 0.52
        && hubRoundness >= 0.68
      const insideInnerAxleBand = component.center.x >= innerXMin
        && component.center.x <= innerXMax
      const innerHubSource = hubCentered && compactHub && insideInnerAxleBand
      const sidewallPlane = frontInnerSidewallPlanes.get(candidateSlot)
      const selectionAxis = sidewallPlane?.outerAxis
        ?? new THREE.Vector3(candidateSlot === 'left-front' ? -1 : 1, 0, 0)
      const sidewallMargin = Math.max(tireSize.x * 0.08, modelSize.x * 0.004)
      const outerComponentMargin = Math.max(tireSize.x * 0.55, modelSize.x * 0.018)
      const innerSideXMin = candidateSlot === 'left-front'
        ? tireAnchor.box.max.x - tireSize.x * 0.58
        : tireAnchor.box.min.x - sidewallMargin
      const innerSideXMax = candidateSlot === 'left-front'
        ? tireAnchor.box.max.x + sidewallMargin
        : tireAnchor.box.min.x + tireSize.x * 0.58
      const componentTouchesInnerSidewall = component.box.max.x >= innerSideXMin
        && component.box.min.x <= innerSideXMax
        && component.box.max.y >= tireAnchor.center.y - tireDiameter * 0.6
        && component.box.min.y <= tireAnchor.center.y + tireDiameter * 0.6
        && component.box.max.z >= tireAnchor.center.z - tireDiameter * 0.6
        && component.box.min.z <= tireAnchor.center.z + tireDiameter * 0.6
      const componentTouchesTire = component.box.max.x >= tireAnchor.box.min.x - outerComponentMargin
        && component.box.min.x <= tireAnchor.box.max.x + outerComponentMargin
        && component.box.max.y >= tireAnchor.center.y - tireDiameter * 0.62
        && component.box.min.y <= tireAnchor.center.y + tireDiameter * 0.62
        && component.box.max.z >= tireAnchor.center.z - tireDiameter * 0.62
        && component.box.min.z <= tireAnchor.center.z + tireDiameter * 0.62
      if (
        !wheelSource
        && !innerHubSource
        && !componentTouchesInnerSidewall
        && !componentTouchesTire
      ) continue

      const position = component.mesh.geometry.getAttribute('position')
      const normal = component.mesh.geometry.getAttribute('normal')
      const index = component.mesh.geometry.index
      if (!position) continue
      const radius = Math.max(tireSize.y, tireSize.z) * 0.6
      const innerSidewallRadius = Math.max(tireSize.y, tireSize.z) * 0.24
      const tireAnnulusRadius = Math.max(tireSize.y, tireSize.z) * 0.2
      const tireEnvelopeMargin = Math.max(tireSize.x * 0.06, modelSize.x * 0.003)
      const tireEnvelopeXMin = tireAnchor.box.min.x - tireEnvelopeMargin
      const tireEnvelopeXMax = tireAnchor.box.max.x + tireEnvelopeMargin
      const xMin = innerXMin
      const xMax = innerXMax
      const wheelTriangles: number[] = []
      const staticTriangles: number[] = []
      const vertexPoint = new THREE.Vector3()
      const vertexNormal = new THREE.Vector3()
      const tiltedOffset = new THREE.Vector3()
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(component.mesh.matrixWorld)
      for (const triangleStart of component.triangleStarts) {
        let insideWheelCylinder = true
        let insideTireEnvelope = true
        let insideInnerSidewall = true
        let axleNormalAlignment = 0
        let triangleCenterX = 0
        let triangleAxial = 0
        let triangleTiltedRadial = 0
        for (let vertex = 0; vertex < 3; vertex++) {
          const vertexIndex = index ? index.getX(triangleStart + vertex) : triangleStart + vertex
          vertexPoint
            .fromBufferAttribute(position, vertexIndex)
            .applyMatrix4(component.mesh.matrixWorld)
          const radial = Math.hypot(
            vertexPoint.y - tireAnchor.center.y,
            vertexPoint.z - tireAnchor.center.z,
          )
          tiltedOffset.copy(vertexPoint).sub(tireAnchor.center)
          const axial = tiltedOffset.dot(selectionAxis)
          const tiltedRadial = tiltedOffset.addScaledVector(
            selectionAxis,
            -axial,
          ).length()
          triangleCenterX += vertexPoint.x
          triangleAxial += axial
          triangleTiltedRadial += tiltedRadial
          if (vertexPoint.x < xMin || vertexPoint.x > xMax || radial > radius) {
            insideWheelCylinder = false
          }
          if (
            vertexPoint.x < tireEnvelopeXMin
            || vertexPoint.x > tireEnvelopeXMax
            || radial < tireAnnulusRadius
            || radial > radius
          ) insideTireEnvelope = false
          if (
            vertexPoint.x < innerSideXMin
            || vertexPoint.x > innerSideXMax
            || radial < innerSidewallRadius
            || radial > radius
          ) insideInnerSidewall = false
          if (normal) {
            vertexNormal.fromBufferAttribute(normal, vertexIndex).applyNormalMatrix(normalMatrix)
            axleNormalAlignment += Math.abs(vertexNormal.x)
          }
        }
        axleNormalAlignment /= 3
        triangleCenterX /= 3
        triangleAxial /= 3
        triangleTiltedRadial /= 3
        const innerSidewallTriangle = insideInnerSidewall
          && Boolean(sidewallPlane)
          && Boolean(sidewallPlane?.components.has(component))
          && Math.abs(triangleCenterX - (sidewallPlane?.x ?? 0))
            <= (sidewallPlane?.tolerance ?? 0)
          && (!normal || axleNormalAlignment >= 0.55)
        const tireShapeComponent = Boolean(sidewallPlane?.ringComponents.has(component))
        const outerSidewallTriangle = Boolean(sidewallPlane)
          && sidewallPlane?.outerAxial !== undefined
          && triangleAxial >= sidewallPlane.axialMin
            + (sidewallPlane.axialMax - sidewallPlane.axialMin) * 0.5
          && triangleAxial <= sidewallPlane.axialMax
            + (sidewallPlane.axialMax - sidewallPlane.axialMin) * 0.25
          && triangleTiltedRadial >= tireAnnulusRadius * 0.95
          && triangleTiltedRadial <= radius * 1.08
        const axleReferenceTriangle = wheelSource && insideWheelCylinder
        const rolls = (wheelSource && insideTireEnvelope)
          || (innerHubSource && insideWheelCylinder)
          || innerSidewallTriangle
          || tireShapeComponent
          || outerSidewallTriangle
        if (axleReferenceTriangle) {
          target.frontAxleTriangles.get(candidateSlot)?.push(triangleStart)
        }
        ;(rolls ? wheelTriangles : staticTriangles).push(triangleStart)
      }
      if (wheelTriangles.length) {
        target.wheelTriangles.get(candidateSlot)?.push(...wheelTriangles)
        target.staticTriangles.push(...staticTriangles)
        slot = candidateSlot
        break
      }
    }

    if (slot) continue

    if (!slot) slot = component.anchorSlot
    if (slot?.endsWith('-front')) slot = null
    if (!slot) {
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const [candidateSlot, center] of centers) {
        if (candidateSlot.endsWith('-front')) continue
        const dx = Math.abs(component.center.x - center.x)
        const dy = Math.abs(component.center.y - center.y)
        const dz = Math.abs(component.center.z - center.z)
        const compactEnough = component.size.x <= modelSize.x * 0.26
          && component.size.y <= modelSize.y * 0.62
          && component.size.z <= modelSize.z * 0.15
        const insideWheelEnvelope = dx <= modelSize.x * 0.1
          && dy <= modelSize.y * 0.28
          && dz <= modelSize.z * 0.07
        const distance = dx / modelSize.x + dy / modelSize.y + dz / modelSize.z
        if (compactEnough && insideWheelEnvelope && distance < nearestDistance) {
          slot = candidateSlot
          nearestDistance = distance
        }
      }
    }
    if (slot) target.wheelTriangles.get(slot)?.push(...component.triangleStarts)
    else target.staticTriangles.push(...component.triangleStarts)
  }

  const frontAxles = new Map<PlayerWheelSlot, THREE.Vector3>(
    [...frontSelectionAxles].map(([slot, axle]) => [slot, axle.clone()]),
  )
  const axleReferenceMaterial = new THREE.MeshBasicMaterial()
  for (const slot of ['left-front', 'right-front'] as const) {
    if (frontAxles.has(slot)) continue
    const references: THREE.Mesh[] = []
    for (const mesh of meshes) {
      const triangles = trianglesByMesh.get(mesh)?.frontAxleTriangles.get(slot) ?? []
      const geometry = buildTriangleSubsetGeometry(mesh.geometry, triangles)
      if (!geometry) continue
      const reference = new THREE.Mesh(geometry, axleReferenceMaterial)
      reference.matrixAutoUpdate = false
      reference.matrix.copy(mesh.matrixWorld)
      reference.matrixWorld.copy(mesh.matrixWorld)
      references.push(reference)
    }
    if (references.length) {
      frontAxles.set(slot, smallestPrincipalAxisForObjects(references))
      references.forEach((reference) => reference.geometry.dispose())
    }
  }
  axleReferenceMaterial.dispose()

  for (const mesh of meshes) {
    const parent = mesh.parent
    const split = trianglesByMesh.get(mesh)
    if (!parent || !split) continue
    const staticGeometry = buildTriangleSubsetGeometry(mesh.geometry, split.staticTriangles)
    if (staticGeometry) {
      const staticMesh = new THREE.Mesh(staticGeometry, mesh.material)
      staticMesh.name = `mercedes-w15-static-${mesh.id}`
      staticMesh.position.copy(mesh.position)
      staticMesh.quaternion.copy(mesh.quaternion)
      staticMesh.scale.copy(mesh.scale)
      staticMesh.castShadow = mesh.castShadow
      staticMesh.receiveShadow = mesh.receiveShadow
      staticMesh.frustumCulled = mesh.frustumCulled
      parent.add(staticMesh)
    }
    for (const [slot, triangles] of split.wheelTriangles) {
      const geometry = buildTriangleSubsetGeometry(mesh.geometry, triangles)
      if (!geometry) continue
      const component = new THREE.Mesh(geometry, mesh.material)
      component.name = `mercedes-w15-wheel-${slot}-${mesh.id}`
      component.position.copy(mesh.position)
      component.quaternion.copy(mesh.quaternion)
      component.scale.copy(mesh.scale)
      component.castShadow = mesh.castShadow
      component.receiveShadow = mesh.receiveShadow
      component.frustumCulled = mesh.frustumCulled
      parent.add(component)
      rolling.get(slot)?.push(component)
    }
    parent.remove(mesh)
    mesh.geometry.dispose()
  }
  root.updateMatrixWorld(true)
  return { rolling, centers, frontAxles }
}

function createMercedesW15WheelRigs(root: THREE.Object3D): PlayerWheelRig[] {
  // Known-good model-specific profile. Keep AMG changes isolated and update
  // AMG_W15_WHEEL_PROFILE.md whenever this calibration intentionally changes.
  const components = splitMercedesWheelComponents(root)
  const frontRolling = new Map<PlayerWheelSlot, THREE.Object3D[]>([
    ['left-front', components.rolling.get('left-front') ?? []],
    ['right-front', components.rolling.get('right-front') ?? []],
  ])
  const rearRolling = new Map<PlayerWheelSlot, THREE.Object3D[]>([
    ['left-rear', components.rolling.get('left-rear') ?? []],
    ['right-rear', components.rolling.get('right-rear') ?? []],
  ])
  const rearCenters = new Map<PlayerWheelSlot, THREE.Vector3>()
  for (const slot of ['left-rear', 'right-rear'] as const) {
    const center = components.centers.get(slot)
    if (center) rearCenters.set(slot, center)
  }

  const frontCenters = new Map<PlayerWheelSlot, THREE.Vector3>()
  for (const slot of ['left-front', 'right-front'] as const) {
    const center = components.centers.get(slot)
    if (center) frontCenters.set(slot, center)
  }

  // The visible white/green hub geometry defines the front axle position.
  // Each inward-cambered front wheel keeps its own one-dimensional axle,
  // derived from the isolated wheel geometry rather than a shared world axis.
  const frontRigs = createWheelRigsFromParts(
    root,
    frontRolling,
    frontCenters,
    components.frontAxles,
  )
  // Detection orients both cambered axles toward the outside of the car.
  // Use the same worldward axle sign on both sides so the mirrored front
  // tires roll forward together.
  const leftFrontRig = frontRigs.find((rig) => rig.name === 'left-front')
  leftFrontRig?.spinAxis.negate()
  const rearRigs = createWheelRigsFromParts(
    root,
    rearRolling,
    rearCenters,
    new THREE.Vector3(1, 0, 0),
  )
  return [...frontRigs, ...rearRigs]
}

function createSteerOnlyRig(
  root: THREE.Object3D,
  name: string,
  partNumbers: readonly number[],
): SteerOnlyRig | null {
  const parts = collectPartObjects(root, partNumbers)
  const steerPivot = createPivotForObjects(root, parts, `player-${name}-steer-only-pivot`)
  if (!steerPivot) return null
  return { name, steerPivot }
}

/** Auto-orient & scale a freshly loaded GLB so wheels touch y=0 and nose points +Z. */
function fitGltfToTrack(model: THREE.Object3D, carId: PlayerCarId): void {
  // Initial bbox at native scale & orientation.
  let bbox = new THREE.Box3().setFromObject(model)
  let size = bbox.getSize(new THREE.Vector3())

  // Scale by planar (x,z) length to 5 m. Using max(x,y,z) lets a tall rear
  // wing inflate the bbox and shrink the actual on-track footprint, which
  // makes some packs with tall rear wings visibly smaller than others.
  const planarLongest = Math.max(size.x, size.z)
  if (planarLongest > 0) {
    // The lion includes a large chibi rider, so matching an F1 car's full
    // five-metre length also makes it nearly six metres tall. Give this
    // novelty vehicle its own compact footprint instead.
    const targetLength = carId === 'lion' ? 2.6 : TARGET_LENGTH_M
    const s = targetLength / planarLongest
    model.scale.setScalar(s)
  }

  // Recompute after scale.
  bbox = new THREE.Box3().setFromObject(model)
  size = bbox.getSize(new THREE.Vector3())
  const center = bbox.getCenter(new THREE.Vector3())

  // Center horizontally; bottom on y=0.
  model.position.x -= center.x
  model.position.y -= bbox.min.y
  model.position.z -= center.z

  // Game forward = +Z (camera sits at -Z behind the car). If the longest
  // axis is X (model exported with nose along ±X), rotate -90° around Y.
  if (size.x > size.z * 1.1) {
    model.rotation.y = -Math.PI / 2
    // Re-center after rotation so bbox-min/max reflects the final pose.
    bbox = new THREE.Box3().setFromObject(model)
    const c2 = bbox.getCenter(new THREE.Vector3())
    model.position.x -= c2.x
    model.position.z -= c2.z
    model.position.y -= bbox.min.y
  }
}

const FERRARI_F175_WHEEL_NODES = [
  { name: 'right-front', wheel: 'WHEEL_RF_19', hub: 'HUB_RF_20', steerable: true },
  { name: 'left-front', wheel: 'WHEEL_LF_40', hub: 'HUB_LF_41', steerable: true },
  { name: 'left-rear', wheel: 'WHEEL_LR_54', hub: 'HUB_LR_55', steerable: false },
  { name: 'right-rear', wheel: 'WHEEL_RR_69', hub: 'HUB_RR_70', steerable: false },
] as const

function createFerrariF175WheelRigs(root: THREE.Object3D): PlayerWheelRig[] {
  root.updateMatrixWorld(true)
  const rigs: PlayerWheelRig[] = []
  for (const definition of FERRARI_F175_WHEEL_NODES) {
    const wheel = root.getObjectByName(definition.wheel)
    const hub = root.getObjectByName(definition.hub)
    if (!wheel || !hub || wheel.parent !== hub) continue

    rigs.push({
      name: definition.name,
      steerable: definition.steerable,
      steerPivot: {
        pivot: hub as THREE.Group,
        baseQuaternion: hub.quaternion.clone(),
      },
      spinPivots: [{
        pivot: wheel as THREE.Group,
        baseQuaternion: wheel.quaternion.clone(),
      }],
      spinAxis: new THREE.Vector3(1, 0, 0),
      spin: 0,
      baseCenterWorld: wheel.getWorldPosition(new THREE.Vector3()),
      // Match the visually verified standalone preview: steering is applied
      // before each authored front-hub quaternion, while wheel roll stays on
      // the wheel node's own cambered local X axis.
      steerComposition: 'premultiply',
    })
  }
  return rigs
}

const FOM_WHEEL_MATERIALS = new Set([
  'tread_medium',
  'sidewall',
  'livery_audi_01_wheel_hub',
  'hub_nut',
  'discs',
])

const FOM_WHEEL_AXLE_REFERENCE_MATERIALS = new Set([
  'tread_medium',
  'sidewall',
])

export function createFom2026WheelRigs(root: THREE.Object3D): PlayerWheelRig[] {
  root.updateMatrixWorld(true)
  const modelCenter = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3())
  const rolling = new Map<PlayerWheelSlot, THREE.Object3D[]>([
    ['left-front', []],
    ['right-front', []],
    ['left-rear', []],
    ['right-rear', []],
  ])
  const axleReferences = new Map<PlayerWheelSlot, THREE.Mesh[]>([
    ['left-front', []],
    ['right-front', []],
    ['left-rear', []],
    ['right-rear', []],
  ])
  const sidewallReferences = new Map<PlayerWheelSlot, THREE.Mesh[]>([
    ['left-front', []],
    ['right-front', []],
    ['left-rear', []],
    ['right-rear', []],
  ])
  const treadReferences = new Map<PlayerWheelSlot, THREE.Mesh[]>([
    ['left-front', []],
    ['right-front', []],
    ['left-rear', []],
    ['right-rear', []],
  ])
  const candidates: THREE.Mesh[] = []
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry || !mesh.parent) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (materials.some((material) => FOM_WHEEL_MATERIALS.has(material?.name ?? ''))) {
      candidates.push(mesh)
    }
  })

  const point = new THREE.Vector3()
  for (const mesh of candidates) {
    const parent = mesh.parent
    const position = mesh.geometry.getAttribute('position')
    if (!parent || !position) continue
    const index = mesh.geometry.index
    const total = index?.count ?? position.count
    const slots = new Map<PlayerWheelSlot, number[]>([
      ['left-front', []],
      ['right-front', []],
      ['left-rear', []],
      ['right-rear', []],
    ])
    const referenceSlots = new Map<PlayerWheelSlot, number[]>([
      ['left-front', []],
      ['right-front', []],
      ['left-rear', []],
      ['right-rear', []],
    ])
    const sidewallSlots = new Map<PlayerWheelSlot, number[]>([
      ['left-front', []],
      ['right-front', []],
      ['left-rear', []],
      ['right-rear', []],
    ])
    const treadSlots = new Map<PlayerWheelSlot, number[]>([
      ['left-front', []],
      ['right-front', []],
      ['left-rear', []],
      ['right-rear', []],
    ])
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const materialNameAt = (triangleOffset: number): string => {
      const group = mesh.geometry.groups.find(
        (candidate) => triangleOffset >= candidate.start
          && triangleOffset < candidate.start + candidate.count,
      )
      return materials[group?.materialIndex ?? 0]?.name ?? ''
    }
    for (let offset = 0; offset + 2 < total; offset += 3) {
      let x = 0
      let z = 0
      for (let vertex = 0; vertex < 3; vertex++) {
        point.fromBufferAttribute(position, index ? index.getX(offset + vertex) : offset + vertex)
          .applyMatrix4(mesh.matrixWorld)
        x += point.x
        z += point.z
      }
      const side = x / 3 < modelCenter.x ? 'left' : 'right'
      const axle = z / 3 > modelCenter.z ? 'front' : 'rear'
      const slot = `${side}-${axle}` as PlayerWheelSlot
      slots.get(slot)?.push(offset)
      const materialName = materialNameAt(offset)
      if (FOM_WHEEL_AXLE_REFERENCE_MATERIALS.has(materialName)) {
        referenceSlots.get(slot)?.push(offset)
      }
      if (materialName === 'sidewall') sidewallSlots.get(slot)?.push(offset)
      if (materialName === 'tread_medium') treadSlots.get(slot)?.push(offset)
    }
    for (const [slot, triangles] of referenceSlots) {
      const geometry = buildTriangleSubsetGeometry(mesh.geometry, triangles)
      if (!geometry) continue
      const reference = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      reference.name = `fom-wheel-${slot}-axle-reference`
      reference.matrixAutoUpdate = false
      reference.matrix.copy(mesh.matrixWorld)
      reference.matrixWorld.copy(mesh.matrixWorld)
      axleReferences.get(slot)?.push(reference)
    }
    for (const [slot, triangles] of sidewallSlots) {
      const geometry = buildTriangleSubsetGeometry(mesh.geometry, triangles)
      if (!geometry) continue
      const reference = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      reference.name = `fom-wheel-${slot}-sidewall-reference`
      reference.matrixAutoUpdate = false
      reference.matrix.copy(mesh.matrixWorld)
      reference.matrixWorld.copy(mesh.matrixWorld)
      sidewallReferences.get(slot)?.push(reference)
    }
    for (const [slot, triangles] of treadSlots) {
      const geometry = buildTriangleSubsetGeometry(mesh.geometry, triangles)
      if (!geometry) continue
      const reference = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
      reference.name = `fom-wheel-${slot}-tread-reference`
      reference.matrixAutoUpdate = false
      reference.matrix.copy(mesh.matrixWorld)
      reference.matrixWorld.copy(mesh.matrixWorld)
      treadReferences.get(slot)?.push(reference)
    }
    for (const [slot, triangles] of slots) {
      const geometry = buildTriangleSubsetGeometry(mesh.geometry, triangles)
      if (!geometry) continue
      const part = new THREE.Mesh(geometry, mesh.material)
      part.name = `fom-wheel-${slot}-${mesh.name}`
      part.position.copy(mesh.position)
      part.quaternion.copy(mesh.quaternion)
      part.scale.copy(mesh.scale)
      part.castShadow = mesh.castShadow
      part.receiveShadow = mesh.receiveShadow
      part.frustumCulled = mesh.frustumCulled
      parent.add(part)
      rolling.get(slot)?.push(part)
    }
    parent.remove(mesh)
    mesh.geometry.dispose()
  }
  root.updateMatrixWorld(true)

  const centers = new Map<PlayerWheelSlot, THREE.Vector3>()
  const axles = new Map<PlayerWheelSlot, THREE.Vector3>()
  for (const [slot, parts] of rolling) {
    if (!parts.length) continue
    const references = axleReferences.get(slot) ?? []
    const sidewalls = sidewallReferences.get(slot) ?? []
    const treads = treadReferences.get(slot) ?? []
    const tireReferences = references.length ? references : parts
    const fallbackCenter = renderedBoxForObjects(tireReferences)
      .getCenter(new THREE.Vector3())
    // The authored front wheels include steering/toe in their cylindrical
    // tread shape, so derive their axes from each tread independently.
    // Rear sidewall normals are more stable and are already visually verified.
    const axle = slot.endsWith('-front')
      ? cylinderAxisFromSurfaceGeometry(treads)
        ?? smallestPrincipalAxisForObjects(treads.length ? treads : tireReferences)
      : areaWeightedSidewallAxisForObjects(sidewalls)
        ?? smallestPrincipalAxisForObjects(tireReferences)
    // Geometry-normal and principal-axis signs are arbitrary. Keep every
    // wheel oriented toward
    // world +X so equal spin deltas always mean the same travel direction,
    // while preserving each wheel's authored camber.
    if (axle.x < 0) axle.multiplyScalar(-1)
    axles.set(slot, axle)
    centers.set(
      slot,
      slot.endsWith('-front')
        ? fittedWheelCenterForObjects(
          treads.length ? treads : tireReferences,
          axle,
          fallbackCenter,
        )
        : fallbackCenter,
    )
  }
  for (const references of axleReferences.values()) {
    for (const reference of references) {
      reference.geometry.dispose()
      ;(reference.material as THREE.Material).dispose()
    }
  }
  for (const references of sidewallReferences.values()) {
    for (const reference of references) {
      reference.geometry.dispose()
      ;(reference.material as THREE.Material).dispose()
    }
  }
  for (const references of treadReferences.values()) {
    for (const reference of references) {
      reference.geometry.dispose()
      ;(reference.material as THREE.Material).dispose()
    }
  }
  return createWheelRigsFromParts(
    root,
    rolling,
    centers,
    axles,
  )
}

function createPlayerWheelRigs(carId: PlayerCarId, model: THREE.Object3D): PlayerWheelRig[] {
  const strategy = wheelStrategyForPlayerCar(carId)
  if (strategy === 'redbull-github-v1') return createRedBullWheelRigs(model)
  if (strategy === 'saber-lion-named-v1') {
    const rigs: WheelRig[] = []
    for (const [name, steerable] of [
      ['LionWheelLF', true],
      ['LionWheelRF', true],
      ['LionWheelLR', false],
      ['LionWheelRR', false],
    ] as [string, boolean][]) {
      const steerPivot = model.getObjectByName(`${name}_STEER`)
      const spinPivot = model.getObjectByName(`${name}_SPIN`)
      if (!steerPivot || !spinPivot) continue
      rigs.push({
        name,
        steerable,
        steerPivot: { pivot: steerPivot as THREE.Group, baseQuaternion: steerPivot.quaternion.clone() },
        spinPivots: [{ pivot: spinPivot as THREE.Group, baseQuaternion: spinPivot.quaternion.clone() }],
        spinAxis: new THREE.Vector3(1, 0, 0),
        spin: 0,
      })
    }
    return rigs
  }
  if (strategy === 'ferrari-f1-75-named-v1') return createFerrariF175WheelRigs(model)
  if (strategy === 'mercedes-w15-compressed-v1') return createMercedesW15WheelRigs(model)
  if (strategy === 'fom-2026-material-v1') return createFom2026WheelRigs(model)
  if (strategy === 'mclaren-material-v1') {
    return createMaterialWheelRigs(model, MATERIAL_WHEEL_PROFILES.mclaren)
  }

  // Each model owns its wheel strategy. Uncalibrated cars intentionally keep
  // static wheels until their own mesh mapping and pivots have been verified.
  return []
}

export function updatePlayerWheelRigs(
  rigs: readonly PlayerWheelRig[],
  spinDelta: number,
  steer: number,
): void {
  const steerQuat = new THREE.Quaternion().setFromAxisAngle(
    WHEEL_STEER_AXIS,
    -THREE.MathUtils.clamp(steer, -1, 1) * FRONT_STEER_MAX_RAD,
  )
  for (const rig of rigs) {
    rig.spin += spinDelta
    rig.steerPivot.pivot.quaternion.copy(rig.steerPivot.baseQuaternion)
    if (rig.steerable) {
      if (rig.steerComposition === 'premultiply') {
        rig.steerPivot.pivot.quaternion.premultiply(steerQuat)
      } else {
        rig.steerPivot.pivot.quaternion.multiply(steerQuat)
      }
    }
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(rig.spinAxis, rig.spin)
    for (const spinPivot of rig.spinPivots) {
      spinPivot.pivot.quaternion.copy(spinPivot.baseQuaternion).multiply(spinQuat)
    }
  }
}

export function createCar(options: CarOptions = {}): CarBundle {
  const group = new THREE.Group()
  group.name = 'car'
  group.scale.setScalar(options.visualScale ?? 1)
  // Vehicle-specific presentation lives below the world-space driving pose.
  // This lets the lion tip around its longitudinal axis without disturbing
  // heading, ground-normal alignment, physics or the chase camera.
  const visualRoot = new THREE.Group()
  visualRoot.name = 'car-visual-root'
  group.add(visualRoot)

  // ---- Placeholder shown immediately, replaced when GLB resolves.
  const placeholder = buildPlaceholder()
  visualRoot.add(placeholder.group)
  let placeholderActive = true
  let activeModel: THREE.Object3D = placeholder.group
  let activeWheels: THREE.Mesh[] = placeholder.wheels
  let wheelRigs: PlayerWheelRig[] = []
  let activeFomLivery: FomSpecialLivery | null = null
  let liveryElapsedMs = 0
  let steerOnlyRigs: SteerOnlyRig[] = []
  let smoothSteer = 0
  let lionRoll = 0
  let lionRollVelocity = 0

  // ---- Particle effects in WORLD space (parented to `particles`, not the
  // car group, so they don't drag along when the car moves/turns).
  const particles = new THREE.Group()
  particles.name = 'car-particles'
  // Sentinel: dead particles are parked far below the world so they're
  // invisible without needing a custom shader.
  const SENTINEL_Y = -10000

  const initBuffer = (buf: Float32Array): void => {
    for (let i = 0; i < buf.length; i += 3) buf[i + 1] = SENTINEL_Y
  }

  const trailGeo = new THREE.BufferGeometry()
  const trailPos = new Float32Array(PARTICLE_MAX * 3)
  const trailLife = new Float32Array(PARTICLE_MAX)
  initBuffer(trailPos)
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3))
  const trailMat = new THREE.PointsMaterial({
    color: '#ffffff',
    size: 0.5,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const trail = new THREE.Points(trailGeo, trailMat)
  trail.frustumCulled = false
  particles.add(trail)
  let trailCursor = 0

  const sparkGeo = new THREE.BufferGeometry()
  const sparkPos = new Float32Array(PARTICLE_MAX * 3)
  const sparkVel = new Float32Array(PARTICLE_MAX * 3)
  const sparkLife = new Float32Array(PARTICLE_MAX)
  initBuffer(sparkPos)
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3))
  const sparkMat = new THREE.PointsMaterial({
    color: '#ffd870',
    size: 0.6,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const sparks = new THREE.Points(sparkGeo, sparkMat)
  sparks.frustumCulled = false
  particles.add(sparks)
  let sparkCursor = 0

  // GLB loader: log to console only (no on-screen panel — HUD lives at the
  // same screen edge and the panel was hiding it).
  const log = (msg: string, _color = '#0f0'): void => {
    console.log('[F1S][GLB]', msg)
  }

  // ---- Async GLB load via fetch + parse (data: URL safe across file://).
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  loader.setDRACOLoader(getDracoLoader())
  let loadVersion = 0
  let requestedCarId: PlayerCarId | null = null
  let activeCarId: PlayerCarId | null = null
  let disposed = false

  const disposeLoadedModel = (model: THREE.Object3D): void => {
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const material = mesh.material
      if (material) {
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material.dispose()
      }
    })
  }

  const setCarModel = async (carId: PlayerCarId): Promise<void> => {
    if (disposed) return
    if (requestedCarId === carId) {
      if (carId === 'audi' && activeCarId === carId && !placeholderActive) {
        try {
          await applyCustomLivery(group, activeModel)
        } catch (error) {
          console.warn('[F1S] custom livery refresh failed:', error)
        }
      }
      return
    }
    requestedCarId = carId
    const version = ++loadVersion
    const definition = playerCarById(carId)
    const modelUrl = definition.raceUrl ?? definition.url
    try {
      log(`fetching ${carId} [${definition.wheelStrategy}]:\n${definition.url.slice(0, 120)}${definition.url.length > 120 ? '…' : ''}`)
      const buf = await loadLocalAsset(modelUrl)
      log(`fetched ${buf.byteLength} bytes, parsing…`)

      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        loader.parse(
          buf,
          '',
          (g) => resolve(g as unknown as { scene: THREE.Group }),
          (e) => reject(e),
        )
      })

      const model = gltf.scene
      if (disposed || version !== loadVersion) {
        disposeLoadedModel(model)
        return
      }
      let meshCount = 0
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshCount++
      })
      log(`parsed OK, meshes=${meshCount}, fitting…`)

      fitGltfToTrack(model, carId)
      if (definition.id === 'creator') {
        applyFomThemeColor(model, readFomThemeColor())
      } else if (definition.id === 'audi') {
        applyFomThemeColor(model, '#ffffff')
      }
      const nextFomLivery = definition.livery === 'fom-special'
        || definition.livery === 'fom-partner'
        ? await applyFomSpecialLivery(
          model,
          undefined,
          definition.livery === 'fom-partner' ? 'partners' : 'core',
        )
        : null
      sharpenCarTextures(model)
      if (definition.reverse) {
        // Ferrari and Mercedes are authored tail-first relative to the game's
        // +Z forward convention. Rotate the complete model before extracting
        // wheel slots so their front axle is classified correctly as well.
        model.rotation.y += Math.PI
        model.updateMatrixWorld(true)
      }
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = false
          prepareMeshForInteriorCamera(mesh)
        }
      })
      const nextWheelRigs = createPlayerWheelRigs(carId, model)
      if (definition.wheelStrategy !== 'pending' && nextWheelRigs.length !== 4) {
        nextFomLivery?.dispose()
        disposeLoadedModel(model)
        throw new Error(
          `${carId} wheel profile produced ${nextWheelRigs.length}/4 rigs; refusing an unsafe model swap`,
        )
      }
      if (disposed || version !== loadVersion) {
        nextFomLivery?.dispose()
        disposeLoadedModel(model)
        return
      }

      if (placeholderActive) {
        visualRoot.remove(placeholder.group)
        disposePlaceholder(placeholder)
        placeholderActive = false
      } else {
        activeFomLivery?.dispose()
        clearCustomLivery(group, activeModel)
        visualRoot.remove(activeModel)
        disposeLoadedModel(activeModel)
      }
      visualRoot.add(model)
      if (definition.id === 'audi') {
        try {
          await applyCustomLivery(group, model)
        } catch (error) {
          console.warn('[F1S] custom livery apply failed:', error)
        }
      }
      if (disposed || version !== loadVersion) {
        clearCustomLivery(group, model)
        visualRoot.remove(model)
        nextFomLivery?.dispose()
        disposeLoadedModel(model)
        return
      }
      activeModel = model
      activeCarId = carId
      activeWheels = []
      wheelRigs = nextWheelRigs
      activeFomLivery = nextFomLivery
      liveryElapsedMs = 0
      steerOnlyRigs = []
      smoothSteer = 0
      lionRoll = 0
      lionRollVelocity = 0
      visualRoot.position.y = 0
      visualRoot.rotation.z = 0
      const bbox = new THREE.Box3().setFromObject(model)
      const sz = bbox.getSize(new THREE.Vector3())
      log(
        `LOADED ${carId} ✓\nstrategy=${definition.wheelStrategy} meshes=${meshCount} wheel-rigs=${wheelRigs.length}\nsize ${sz.x.toFixed(1)}×${sz.y.toFixed(1)}×${sz.z.toFixed(1)}m`,
        '#0f0',
      )
    } catch (e) {
      if (version === loadVersion) requestedCarId = null
      const msg = e instanceof Error ? e.message : String(e)
      const stack = e instanceof Error && e.stack ? `\n${e.stack.split('\n').slice(0, 3).join('\n')}` : ''
      console.warn(`[F1S] ${carId} GLB load failed:`, e)
      log(`FAILED ✗\n${msg}${stack}`, '#f55')
    }
  }

  void setCarModel(options.carId ?? 'redbull')

  const setLivery = (team: TeamId): void => {
    const c = TEAM_COLORS[team]
    sparkMat.color.set(c.spark)
    if (placeholderActive) {
      placeholder.bodyMat.color.set(c.primary)
      placeholder.accentMat.color.set(c.secondary)
    }
    // GLB livery override skipped: real model has named decals/paints we don't
    // want to overwrite blindly. Spark color still differentiates teams.
  }

  const tmpVec = new THREE.Vector3()

  const emitSpeedTrail = (intensity: number): void => {
    const n = Math.max(1, Math.floor(intensity * 4))
    // Emit BEHIND the car in world space.
    const yaw = group.rotation.y
    const back = tmpVec.set(-Math.sin(yaw), 0, -Math.cos(yaw))
    for (let i = 0; i < n; i++) {
      const idx = trailCursor % PARTICLE_MAX
      trailCursor++
      const baseX = group.position.x + back.x * 2.4
      const baseZ = group.position.z + back.z * 2.4
      trailPos[idx * 3 + 0] = baseX + (Math.random() - 0.5) * 1.6
      trailPos[idx * 3 + 1] = group.position.y + 0.4 + Math.random() * 0.3
      trailPos[idx * 3 + 2] = baseZ + (Math.random() - 0.5) * 1.6
      trailLife[idx] = PARTICLE_LIFE
    }
    trailGeo.attributes.position.needsUpdate = true
  }

  const emitSparks = (worldPos: THREE.Vector3, count: number): void => {
    for (let i = 0; i < count; i++) {
      const idx = sparkCursor % PARTICLE_MAX
      sparkCursor++
      sparkPos[idx * 3 + 0] = worldPos.x + (Math.random() - 0.5) * 0.5
      sparkPos[idx * 3 + 1] = worldPos.y + Math.random() * 0.3
      sparkPos[idx * 3 + 2] = worldPos.z + (Math.random() - 0.5) * 0.5
      sparkVel[idx * 3 + 0] = (Math.random() - 0.5) * 6
      sparkVel[idx * 3 + 1] = 2 + Math.random() * 4
      sparkVel[idx * 3 + 2] = (Math.random() - 0.5) * 6
      sparkLife[idx] = 1.5
    }
    sparkGeo.attributes.position.needsUpdate = true
  }

  const update = (dt: number, speed01: number, steer = 0): void => {
    liveryElapsedMs += dt * 1000
    activeFomLivery?.update(liveryElapsedMs)
    const spin = speed01 * PLAYER_WHEEL_SPIN_RATE * dt
    for (const w of activeWheels) w.rotation.x += spin
    smoothSteer += (THREE.MathUtils.clamp(steer, -1, 1) - smoothSteer) * Math.min(1, dt * 14)

    const isLion = requestedCarId === 'lion'
    // The lion's front wheels remain visually straight. Its steering cue is
    // instead the whole kart tipping outward under lateral load.
    const visualWheelSteer = isLion ? 0 : smoothSteer
    updatePlayerWheelRigs(wheelRigs, isLion ? 0 : spin, visualWheelSteer)
    const steerOnlyQuat = new THREE.Quaternion().setFromAxisAngle(
      WHEEL_STEER_AXIS,
      -visualWheelSteer * FRONT_STEER_MAX_RAD,
    )
    for (const rig of steerOnlyRigs) {
      rig.steerPivot.pivot.quaternion.copy(rig.steerPivot.baseQuaternion).multiply(steerOnlyQuat)
    }

    if (isLion) {
      // Lateral load rises roughly with v². A damped spring gives the heavy,
      // playful left/right rock and a small rebound when steering is released.
      // This is a deliberately readable arcade exaggeration: the kart starts
      // transferring weight at city speed and reaches near-full lean well
      // before an F1 car's maximum velocity.
      const speedLoad = THREE.MathUtils.smoothstep(speed01, 0.02, 0.24)
      const targetRoll = smoothSteer * speedLoad * LION_MAX_BODY_ROLL_RAD
      lionRollVelocity += (targetRoll - lionRoll) * LION_ROLL_SPRING * dt
      lionRollVelocity *= Math.exp(-LION_ROLL_DAMPING * dt)
      lionRoll += lionRollVelocity * dt
      lionRoll = THREE.MathUtils.clamp(
        lionRoll,
        -LION_MAX_BODY_ROLL_RAD * 1.12,
        LION_MAX_BODY_ROLL_RAD * 1.12,
      )
      visualRoot.rotation.z = lionRoll
      // Arcade lion behaviour: pivot around the inside contact line so the
      // outside wheels lift visibly during a turn.
      visualRoot.position.y = Math.abs(Math.sin(lionRoll)) * LION_HALF_TRACK_M
    } else {
      lionRoll = 0
      lionRollVelocity = 0
      visualRoot.rotation.z = 0
      visualRoot.position.y = 0
    }

    // Trails: tick down life; on death move to sentinel so they vanish.
    for (let i = 0; i < PARTICLE_MAX; i++) {
      if (trailLife[i] <= 0) continue
      trailLife[i] -= dt
      // Slight upward drift so particles don't sink into the road.
      trailPos[i * 3 + 1] += dt * 0.3
      if (trailLife[i] <= 0) {
        trailPos[i * 3 + 0] = 0
        trailPos[i * 3 + 1] = SENTINEL_Y
        trailPos[i * 3 + 2] = 0
      }
    }
    trailGeo.attributes.position.needsUpdate = true

    // Sparks: gravity + drag in world space; bury when life ends.
    for (let i = 0; i < PARTICLE_MAX; i++) {
      if (sparkLife[i] <= 0) continue
      sparkLife[i] -= dt
      sparkVel[i * 3 + 1] -= 9.8 * dt
      sparkPos[i * 3 + 0] += sparkVel[i * 3 + 0] * dt
      sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt
      sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt
      if (sparkPos[i * 3 + 1] < 0 || sparkLife[i] <= 0) {
        sparkLife[i] = 0
        sparkPos[i * 3 + 0] = 0
        sparkPos[i * 3 + 1] = SENTINEL_Y
        sparkPos[i * 3 + 2] = 0
      }
    }
    sparkGeo.attributes.position.needsUpdate = true
  }

  const movePivotToWorld = (ref: PlayerWheelPivotRef, worldPosition: THREE.Vector3): void => {
    const pivot = ref.pivot
    const parent = pivot.parent
    if (!parent) return
    parent.updateMatrixWorld(true)
    const children = [...pivot.children]
    for (const child of children) parent.attach(child)
    pivot.position.copy(parent.worldToLocal(worldPosition.clone()))
    parent.updateMatrixWorld(true)
    for (const child of children) pivot.attach(child)
    pivot.updateMatrixWorld(true)
  }

  const setFrontAxleDebugOffset = (y: number, z: number): void => {
    for (const rig of wheelRigs) {
      if (!rig.steerable) continue
      if (!rig.baseCenterWorld) continue
      rig.spin = 0
      rig.steerPivot.pivot.quaternion.copy(rig.steerPivot.baseQuaternion)
      for (const spinPivot of rig.spinPivots) {
        spinPivot.pivot.quaternion.copy(spinPivot.baseQuaternion)
      }
      group.updateMatrixWorld(true)
      const desiredCenter = group.localToWorld(
        rig.baseCenterWorld.clone().add(new THREE.Vector3(0, y, z)),
      )
      movePivotToWorld(rig.steerPivot, desiredCenter)
      for (const spinPivot of rig.spinPivots) movePivotToWorld(spinPivot, desiredCenter)
    }
  }

  const getFrontAxleDebug = (): Array<{
    name: string
    center: THREE.Vector3
    axis: THREE.Vector3
  }> => getWheelAxleDebug().filter((rig) => rig.name.endsWith('-front'))

  const getWheelAxleDebug = (): Array<{
    name: string
    center: THREE.Vector3
    axis: THREE.Vector3
  }> => {
    group.updateMatrixWorld(true)
    return wheelRigs
      .map((rig) => {
        const spinPivot = rig.spinPivots[0]?.pivot ?? rig.steerPivot.pivot
        return {
          name: rig.name,
          center: spinPivot.getWorldPosition(new THREE.Vector3()),
          axis: rig.spinAxis.clone().applyQuaternion(
            spinPivot.getWorldQuaternion(new THREE.Quaternion()),
          ).normalize(),
        }
      })
  }

  const dispose = (): void => {
    disposed = true
    loadVersion++
    activeFomLivery?.dispose()
    if (!placeholderActive) clearCustomLivery(group, activeModel)
    activeFomLivery = null
    if (placeholderActive) disposePlaceholder(placeholder)
    else disposeLoadedModel(activeModel)
    trailGeo.dispose()
    trailMat.dispose()
    sparkGeo.dispose()
    sparkMat.dispose()
  }

  return {
    group,
    particles,
    setLivery,
    emitSpeedTrail,
    emitSparks,
    setCarModel,
    setFrontAxleDebugOffset,
    getFrontAxleDebug,
    getWheelAxleDebug,
    update,
    dispose,
  }
}

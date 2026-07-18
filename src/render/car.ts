import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { TeamId } from '../utils/storage'
import { showToast } from '../utils/error'
import carGlbUrl from '../assets/models/RB19_REDBULL.opt.glb?url'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'

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
  update: (dt: number, speed01: number, steer?: number) => void
  dispose: () => void
}

export interface CarOptions {
  visualScale?: number
}

const PARTICLE_MAX = 256
const PARTICLE_LIFE = 1.0
const TARGET_LENGTH_M = 5.0 // real F1 ≈ 5.5 m; pick 5 to feel right against 16 m wide road
const FRONT_STEER_MAX_RAD = THREE.MathUtils.degToRad(18)
const WHEEL_SPIN_RATE = 42
const WHEEL_SPIN_AXIS = new THREE.Vector3(0, 0, 1)
const WHEEL_STEER_AXIS = new THREE.Vector3(0, 1, 0)
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

const RED_BULL_WHEEL_AERO_SOURCE_MATERIALS = new Set([
  'suspensions',
])

type RedBullWheelSlot = 'left-front' | 'right-front' | 'left-rear' | 'right-rear'

interface RedBullWheelComponents {
  rolling: Map<RedBullWheelSlot, THREE.Object3D[]>
  steering: Map<RedBullWheelSlot, THREE.Object3D[]>
}

let dracoLoader: DRACOLoader | null = null

function makeMaterialInteriorVisible(material: THREE.Material): void {
  if (material.side !== THREE.DoubleSide) {
    material.side = THREE.DoubleSide
    material.needsUpdate = true
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

interface PivotRef {
  pivot: THREE.Group
  baseQuaternion: THREE.Quaternion
}

interface WheelRig {
  name: string
  steerable: boolean
  steerPivot: PivotRef
  spinPivots: PivotRef[]
  spinAxis: THREE.Vector3
  spin: number
}

interface SteerOnlyRig {
  name: string
  steerPivot: PivotRef
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

  const eigenvectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let iteration = 0; iteration < 18; iteration++) {
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
    if (largest < 1e-10) break
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
  const axis = new THREE.Vector3(
    eigenvectors[0][smallest],
    eigenvectors[1][smallest],
    eigenvectors[2][smallest],
  ).normalize()
  if (axis.x < 0) axis.negate()
  return Math.abs(axis.x) >= 0.55 ? axis : new THREE.Vector3(1, 0, 0)
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
): PivotRef | null {
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
): WheelRig | null {
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
      ].filter((item): item is PivotRef => Boolean(item))
    : spinParts
        .map((part, index) => createPivotForObjects(steerPivot.pivot, [part], `player-${name}-spin-pivot-${index}`))
        .filter((item): item is PivotRef => Boolean(item))
  if (!spinPivots.length) return null

  return {
    name,
    steerable,
    steerPivot,
    spinPivots,
    spinAxis: spinAxis.clone(),
    spin: 0,
  }
}

function createRedBullWheelRigs(root: THREE.Object3D): WheelRig[] {
  const wheelParts = splitRedBullWheelComponents(root)
  const rigs: WheelRig[] = []
  for (const [name, rollingParts] of wheelParts.rolling) {
    if (!rollingParts.length) continue
    const steeringParts = wheelParts.steering.get(name) ?? []
    const referenceParts = rollingParts.filter((part) => {
      const materials = part.userData.redBullWheelMaterials as string[] | undefined
      return materials?.some((material) => RED_BULL_AXLE_REFERENCE_MATERIALS.has(material)) === true
    })
    const axleParts = referenceParts.length ? referenceParts : rollingParts
    const axleWorld = smallestPrincipalAxisForObjects(axleParts)
    const wheelCenter = renderedBoxForObjects(axleParts).getCenter(new THREE.Vector3())
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
function fitGltfToTrack(model: THREE.Object3D): void {
  // Initial bbox at native scale & orientation.
  let bbox = new THREE.Box3().setFromObject(model)
  let size = bbox.getSize(new THREE.Vector3())

  // Scale by planar (x,z) length to 5 m. Using max(x,y,z) lets a tall rear
  // wing inflate the bbox and shrink the actual on-track footprint, which
  // makes some packs (e.g. McLaren MCL35M) visibly smaller than others.
  const planarLongest = Math.max(size.x, size.z)
  if (planarLongest > 0) {
    const s = TARGET_LENGTH_M / planarLongest
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

export function createCar(options: CarOptions = {}): CarBundle {
  const group = new THREE.Group()
  group.name = 'car'
  group.scale.setScalar(options.visualScale ?? 1)

  // ---- Placeholder shown immediately, replaced when GLB resolves.
  const placeholder = buildPlaceholder()
  group.add(placeholder.group)
  let placeholderActive = true
  let activeModel: THREE.Object3D = placeholder.group
  let activeWheels: THREE.Mesh[] = placeholder.wheels
  let wheelRigs: WheelRig[] = []
  let steerOnlyRigs: SteerOnlyRig[] = []
  let smoothSteer = 0

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
  ;(async () => {
    try {
      log(`fetching:\n${carGlbUrl.slice(0, 120)}${carGlbUrl.length > 120 ? '…' : ''}`)
      const res = await fetch(carGlbUrl)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const buf = await res.arrayBuffer()
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
      let meshCount = 0
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshCount++
      })
      log(`parsed OK, meshes=${meshCount}, fitting…`)

      fitGltfToTrack(model)
      model.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = false
          prepareMeshForInteriorCamera(mesh)
        }
      })
      // Swap placeholder out.
      group.remove(placeholder.group)
      disposePlaceholder(placeholder)
      placeholderActive = false
      group.add(model)
      activeModel = model
      activeWheels = []
      wheelRigs = createRedBullWheelRigs(model)
      steerOnlyRigs = []
      const bbox = new THREE.Box3().setFromObject(model)
      const sz = bbox.getSize(new THREE.Vector3())
      log(
        `LOADED ✓\nmeshes=${meshCount} wheel-rigs=${wheelRigs.length}\nsize ${sz.x.toFixed(1)}×${sz.y.toFixed(1)}×${sz.z.toFixed(1)}m`,
        '#0f0',
      )
      // (debug panel removed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const stack = e instanceof Error && e.stack ? `\n${e.stack.split('\n').slice(0, 3).join('\n')}` : ''
      console.warn('[F1S] GLB load failed:', e)
      log(`FAILED ✗\n${msg}${stack}`, '#f55')
      // keep panel visible; user reports back
    }
  })()

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
      trailPos[idx * 3 + 1] = 0.4 + Math.random() * 0.3
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
    const spin = speed01 * WHEEL_SPIN_RATE * dt
    for (const w of activeWheels) w.rotation.x += spin
    smoothSteer += (THREE.MathUtils.clamp(steer, -1, 1) - smoothSteer) * Math.min(1, dt * 14)

    const steerQuat = new THREE.Quaternion().setFromAxisAngle(
      WHEEL_STEER_AXIS,
      -smoothSteer * FRONT_STEER_MAX_RAD,
    )
    for (const rig of wheelRigs) {
      rig.spin += spin
      if (rig.steerable) rig.steerPivot.pivot.quaternion.copy(rig.steerPivot.baseQuaternion).multiply(steerQuat)
      else rig.steerPivot.pivot.quaternion.copy(rig.steerPivot.baseQuaternion)
      const spinQuat = new THREE.Quaternion().setFromAxisAngle(rig.spinAxis, rig.spin)
      for (const spinPivot of rig.spinPivots) {
        spinPivot.pivot.quaternion.copy(spinPivot.baseQuaternion).multiply(spinQuat)
      }
    }
    for (const rig of steerOnlyRigs) {
      rig.steerPivot.pivot.quaternion.copy(rig.steerPivot.baseQuaternion).multiply(steerQuat)
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

  const dispose = (): void => {
    if (placeholderActive) disposePlaceholder(placeholder)
    activeModel.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material
      if (mat) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })
    trailGeo.dispose()
    trailMat.dispose()
    sparkGeo.dispose()
    sparkMat.dispose()
  }

  return { group, particles, setLivery, emitSpeedTrail, emitSparks, update, dispose }
}

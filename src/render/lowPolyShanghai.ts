import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'

const lowPolyShanghaiUrl = 'assets/上海赛车场压缩.glb'
const ROAD_SURFACE_HINTS = ['road', 'tarmac', 'line_white']
const GROUND_SURFACE_HINTS = [
  ...ROAD_SURFACE_HINTS,
  'sand',
  'grass',
  'gravel',
  'concrete',
  'terrain',
  'carpet',
]
const OBSTACLE_SURFACE_HINTS = [
  'fence',
  'barrier',
  'guardrail',
  'guard_rail',
  'guard-rail',
  'wall',
  'armco',
  'railing',
  'rail',
]

export interface LowPolyShanghaiLoadResult {
  model: THREE.Group
  box: THREE.Box3
  size: THREE.Vector3
  center: THREE.Vector3
}

export interface LowPolyShanghaiPlacement {
  x: number
  z: number
  y: number
  yawDeg: number
  scale: number
}

export interface LowPolyShanghaiBundle {
  group: THREE.Group
  getPlacement: () => LowPolyShanghaiPlacement
  setPlacement: (next: Partial<LowPolyShanghaiPlacement>) => void
  ready: Promise<LowPolyShanghaiLoadResult>
}

export interface LowPolyShanghaiSurfaceSampler {
  sampleHeightAt: (x: number, z: number, fallbackY?: number) => number | null
}

export interface LowPolyShanghaiGroundHit {
  point: THREE.Vector3
  normal: THREE.Vector3
  isRoad: boolean
}

export interface LowPolyShanghaiGroundSampler {
  sampleGroundAt: (x: number, z: number) => LowPolyShanghaiGroundHit | null
}

export interface LowPolyShanghaiObstacleHit {
  point: THREE.Vector3
  normal: THREE.Vector3
  distance: number
}

export interface LowPolyShanghaiObstacleQuery {
  radius?: number
  side?: THREE.Vector3
}

export interface LowPolyShanghaiObstacleSampler {
  sampleObstacleBetween: (
    from: THREE.Vector3,
    to: THREE.Vector3,
    options?: LowPolyShanghaiObstacleQuery,
  ) => LowPolyShanghaiObstacleHit | null
  sampleObstacleNear: (
    point: THREE.Vector3,
    options?: LowPolyShanghaiObstacleQuery,
  ) => LowPolyShanghaiObstacleHit | null
}

export interface LowPolyShanghaiGroundGridOptions {
  cellSize?: number
  timeBudgetMs?: number
  onProgress?: (progress: number, label: string) => void
}

export interface LowPolyShanghaiRenderOptimization {
  chunkCount: number
  hiddenOriginals: number
}

export interface LowPolyShanghaiVisualOptimizer {
  update: (focus: THREE.Vector3, force?: boolean) => void
}

export const LOW_POLY_SHANGHAI_PLACEMENT: LowPolyShanghaiPlacement = {
  x: 0,
  z: 0,
  y: 0,
  yawDeg: 0,
  scale: 1,
}

let dracoLoader: DRACOLoader | null = null
const textureSamplerCache = new WeakMap<THREE.Texture, ((u: number, v: number) => [number, number, number, number]) | null>()

function materialNamesForMesh(mesh: THREE.Mesh): string[] {
  if (!mesh.material) return []
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return materials.map((mat) => mat.name ?? '')
}

function meshHasRoadSurfaceHint(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  return ROAD_SURFACE_HINTS.some((hint) => name.includes(hint))
}

function meshHasGroundSurfaceHint(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  if (name.includes('fence') || name.includes('barrier') || name.includes('wall')) return false
  if (name.includes('collider') || name.includes('tree') || name.includes('startlight')) return false
  return GROUND_SURFACE_HINTS.some((hint) => name.includes(hint))
}

function meshHasObstacleSurfaceHint(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  if (name.includes('road') || name.includes('tarmac') || name.includes('line_white')) return false
  return OBSTACLE_SURFACE_HINTS.some((hint) => name.includes(hint))
}

function meshHasBannerMaterial(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  return name.includes('banners_shanghai')
}

function meshIsColliderOnly(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  return name.includes('collider')
}

function mainShanghaiTextureForMesh(mesh: THREE.Mesh): THREE.Texture | null {
  if (!mesh.material) return null
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const mat of materials) {
    if (mat.name !== 'SHANGHAI') continue
    const texture = (mat as THREE.MeshStandardMaterial).map
    if (texture) return texture
  }
  return null
}

function samplerForTexture(texture: THREE.Texture): ((u: number, v: number) => [number, number, number, number]) | null {
  if (textureSamplerCache.has(texture)) return textureSamplerCache.get(texture) ?? null

  const image = texture.image as CanvasImageSource | undefined
  if (!image) {
    textureSamplerCache.set(texture, null)
    return null
  }

  const width = 'width' in image ? Number(image.width) : 0
  const height = 'height' in image ? Number(image.height) : 0
  if (!width || !height) {
    textureSamplerCache.set(texture, null)
    return null
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      textureSamplerCache.set(texture, null)
      return null
    }
    ctx.drawImage(image, 0, 0, width, height)
    const pixels = ctx.getImageData(0, 0, width, height).data
    const sampler = (u: number, v: number): [number, number, number, number] => {
      const wrappedU = ((u % 1) + 1) % 1
      const wrappedV = ((v % 1) + 1) % 1
      const x = Math.min(width - 1, Math.max(0, Math.floor(wrappedU * width)))
      const y = Math.min(height - 1, Math.max(0, Math.floor((1 - wrappedV) * height)))
      const idx = (y * width + x) * 4
      return [pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]]
    }
    textureSamplerCache.set(texture, sampler)
    return sampler
  } catch {
    textureSamplerCache.set(texture, null)
    return null
  }
}

function isShanghai50MarkerWhiteSample(sample: [number, number, number, number]): boolean {
  const [r, g, b, a] = sample
  if (a < 160) return false
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return r > 185 && g > 185 && b > 185 && max - min < 55
}

function meshSearchName(mesh: THREE.Mesh): string {
  return `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
}

function meshIsStartAreaEssentialVisual(mesh: THREE.Mesh): boolean {
  const name = meshSearchName(mesh)
  return name.includes('garages_shanghai') ||
    name.includes('tents_garages') ||
    name.includes('startlights_shanghai') ||
    name.includes('start_slots') ||
    name.includes('line_white_shanghai')
}

function visualCullDistanceForMesh(mesh: THREE.Mesh): number {
  const name = meshSearchName(mesh)
  if (meshIsStartAreaEssentialVisual(mesh)) return 10000
  if (name.includes('tree')) return 520
  if (name.includes('barrier') || name.includes('fence') || name.includes('wall')) return 460
  if (name.includes('garage') || name.includes('tent') || name.includes('stand')) return 820
  return 950
}

function shouldChunkShanghaiVisualMesh(mesh: THREE.Mesh): boolean {
  if (mesh.userData.driveVisualChunk) return false
  if (meshSearchName(mesh).includes('collider')) return false
  if (meshIsStartAreaEssentialVisual(mesh)) return false
  const position = mesh.geometry?.getAttribute('position')
  return Boolean(position && position.count > 30000)
}

function attributeValue(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  component: number,
): number {
  if (component === 0) return attr.getX(index)
  if (component === 1) return attr.getY(index)
  if (component === 2) return attr.getZ(index)
  return attr.getW(index)
}

function cloneMeshTransform(source: THREE.Mesh, target: THREE.Mesh): void {
  target.position.copy(source.position)
  target.quaternion.copy(source.quaternion)
  target.scale.copy(source.scale)
  target.castShadow = source.castShadow
  target.receiveShadow = source.receiveShadow
  target.frustumCulled = true
  target.renderOrder = source.renderOrder
}

function chunkShanghaiVisualMesh(mesh: THREE.Mesh, gridSize = 120): THREE.Mesh[] {
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
  const position = source.getAttribute('position')
  if (!position || position.count < 3) return []
  const attrNames = Object.keys(source.attributes)
  const buckets = new Map<string, Record<string, number[]>>()
  const metas = new Map<string, { itemSize: number; normalized: boolean }>()
  for (const name of attrNames) {
    const attr = source.getAttribute(name)
    metas.set(name, { itemSize: attr.itemSize, normalized: attr.normalized })
  }

  const bucketForTriangle = (i: number): Record<string, number[]> => {
    const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3
    const cz = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3
    const key = `${Math.floor(cx / gridSize)}:${Math.floor(cz / gridSize)}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {}
      for (const name of attrNames) bucket[name] = []
      buckets.set(key, bucket)
    }
    return bucket
  }

  for (let i = 0; i < position.count; i += 3) {
    const bucket = bucketForTriangle(i)
    for (let vertex = i; vertex < i + 3; vertex++) {
      for (const name of attrNames) {
        const attr = source.getAttribute(name)
        const values = bucket[name]
        for (let component = 0; component < attr.itemSize; component++) {
          values.push(attributeValue(attr, vertex, component))
        }
      }
    }
  }

  const chunks: THREE.Mesh[] = []
  let chunkIndex = 0
  const maxDistance = visualCullDistanceForMesh(mesh)
  for (const bucket of buckets.values()) {
    const chunkGeometry = new THREE.BufferGeometry()
    for (const name of attrNames) {
      const meta = metas.get(name)
      if (!meta) continue
      chunkGeometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(bucket[name]), meta.itemSize, meta.normalized),
      )
    }
    chunkGeometry.computeBoundingBox()
    chunkGeometry.computeBoundingSphere()
    const chunk = new THREE.Mesh(chunkGeometry, mesh.material)
    cloneMeshTransform(mesh, chunk)
    chunk.name = `${mesh.name || 'shanghai-visual'}_chunk_${chunkIndex++}`
    chunk.userData.driveVisualChunk = true
    chunk.userData.driveCullDistanceSq = maxDistance * maxDistance
    chunks.push(chunk)
  }

  if (source !== mesh.geometry) source.dispose()
  return chunks
}

export function optimizeLowPolyShanghaiRendering(
  root: THREE.Object3D,
): LowPolyShanghaiRenderOptimization {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.frustumCulled = true
    if (meshIsColliderOnly(obj)) obj.visible = false
  })
  return { chunkCount: 0, hiddenOriginals: 0 }
}

export function createLowPolyShanghaiVisualOptimizer(
  root: THREE.Object3D,
): LowPolyShanghaiVisualOptimizer {
  const update = (focus: THREE.Vector3, force = false): void => {
    void focus
    void force
  }

  void root
  return { update }
}

function stripLowRoadsideBannerTriangles(mesh: THREE.Mesh): void {
  if (!meshHasBannerMaterial(mesh)) return
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  const position = source.getAttribute('position')
  if (!position || position.count < 3) return

  const matrixWorld = mesh.matrixWorld.clone()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const center = new THREE.Vector3()
  const keep: number[] = []

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i).applyMatrix4(matrixWorld)
    b.fromBufferAttribute(position, i + 1).applyMatrix4(matrixWorld)
    c.fromBufferAttribute(position, i + 2).applyMatrix4(matrixWorld)
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3)

    const isLowRoadsideBanner = center.y > -14 && center.y < 38
    if (!isLowRoadsideBanner) {
      keep.push(i, i + 1, i + 2)
    }
  }

  if (keep.length === position.count) return
  if (keep.length === 0) {
    mesh.visible = false
    return
  }

  const next = new THREE.BufferGeometry()
  for (const name of Object.keys(source.attributes)) {
    const attr = source.getAttribute(name)
    const values: number[] = []
    for (const vertexIndex of keep) {
      for (let component = 0; component < attr.itemSize; component++) {
        values.push(attributeValue(attr, vertexIndex, component))
      }
    }
    next.setAttribute(
      name,
      new THREE.BufferAttribute(new Float32Array(values), attr.itemSize, attr.normalized),
    )
  }
  next.computeBoundingBox()
  next.computeBoundingSphere()
  mesh.geometry = next
}

function stripShanghai50MarkerTriangles(mesh: THREE.Mesh): void {
  const texture = mainShanghaiTextureForMesh(mesh)
  if (!texture) return
  const sampleTexture = samplerForTexture(texture)
  if (!sampleTexture) return

  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  const position = source.getAttribute('position')
  const uv = source.getAttribute('uv')
  if (!position || !uv || position.count < 3) return

  const matrixWorld = mesh.matrixWorld.clone()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const center = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const keep: number[] = []

  const sampleUv = (i0: number, i1: number, i2: number, wa: number, wb: number, wc: number): [number, number, number, number] => {
    const u = attributeValue(uv, i0, 0) * wa + attributeValue(uv, i1, 0) * wb + attributeValue(uv, i2, 0) * wc
    const v = attributeValue(uv, i0, 1) * wa + attributeValue(uv, i1, 1) * wb + attributeValue(uv, i2, 1) * wc
    return sampleTexture(u, v)
  }

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i).applyMatrix4(matrixWorld)
    b.fromBufferAttribute(position, i + 1).applyMatrix4(matrixWorld)
    c.fromBufferAttribute(position, i + 2).applyMatrix4(matrixWorld)
    center.copy(a).add(b).add(c).multiplyScalar(1 / 3)
    normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()

    const isVerticalPanel = Math.abs(normal.y) < 0.45
    const isTracksideHeight = center.y > 1.2 && center.y < 34
    const hasWhiteMarkerTexture =
      isShanghai50MarkerWhiteSample(sampleUv(i, i + 1, i + 2, 1 / 3, 1 / 3, 1 / 3)) ||
      isShanghai50MarkerWhiteSample(sampleUv(i, i + 1, i + 2, 0.72, 0.14, 0.14)) ||
      isShanghai50MarkerWhiteSample(sampleUv(i, i + 1, i + 2, 0.14, 0.72, 0.14)) ||
      isShanghai50MarkerWhiteSample(sampleUv(i, i + 1, i + 2, 0.14, 0.14, 0.72))

    if (isVerticalPanel && isTracksideHeight && hasWhiteMarkerTexture) {
      continue
    }
    keep.push(i, i + 1, i + 2)
  }

  if (keep.length === position.count) return
  if (keep.length === 0) {
    mesh.visible = false
    return
  }

  const next = new THREE.BufferGeometry()
  for (const name of Object.keys(source.attributes)) {
    const attr = source.getAttribute(name)
    const values: number[] = []
    for (const vertexIndex of keep) {
      for (let component = 0; component < attr.itemSize; component++) {
        values.push(attributeValue(attr, vertexIndex, component))
      }
    }
    next.setAttribute(
      name,
      new THREE.BufferAttribute(new Float32Array(values), attr.itemSize, attr.normalized),
    )
  }
  next.computeBoundingBox()
  next.computeBoundingSphere()
  mesh.geometry = next
}

export interface LowPolyShanghaiTriangleErase {
  point: { x: number; y: number; z: number }
  radius: number
  meshName?: string | null
  verticalOnly?: boolean
}

export function eraseLowPolyShanghaiTriangles(
  root: THREE.Object3D,
  deletion: LowPolyShanghaiTriangleErase,
): number {
  const target = new THREE.Vector3(deletion.point.x, deletion.point.y, deletion.point.z)
  const radiusSq = Math.max(0.05, deletion.radius) ** 2
  const verticalOnly = deletion.verticalOnly ?? true
  let removed = 0
  root.updateMatrixWorld(true)

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry || !obj.visible) return
    if (deletion.meshName && obj.name !== deletion.meshName) return

    const source = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone()
    const position = source.getAttribute('position')
    if (!position || position.count < 3) return

    const matrixWorld = obj.matrixWorld.clone()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const center = new THREE.Vector3()
    const normal = new THREE.Vector3()
    const keep: number[] = []

    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i).applyMatrix4(matrixWorld)
      b.fromBufferAttribute(position, i + 1).applyMatrix4(matrixWorld)
      c.fromBufferAttribute(position, i + 2).applyMatrix4(matrixWorld)
      center.copy(a).add(b).add(c).multiplyScalar(1 / 3)
      normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
      const matchesSurface = !verticalOnly || Math.abs(normal.y) < 0.72
      if (matchesSurface && center.distanceToSquared(target) <= radiusSq) {
        removed++
      } else {
        keep.push(i, i + 1, i + 2)
      }
    }

    if (keep.length === position.count) return
    if (keep.length === 0) {
      obj.visible = false
      return
    }

    const next = new THREE.BufferGeometry()
    for (const name of Object.keys(source.attributes)) {
      const attr = source.getAttribute(name)
      const values: number[] = []
      for (const vertexIndex of keep) {
        for (let component = 0; component < attr.itemSize; component++) {
          values.push(attributeValue(attr, vertexIndex, component))
        }
      }
      next.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(values), attr.itemSize, attr.normalized),
      )
    }
    next.computeBoundingBox()
    next.computeBoundingSphere()
    obj.geometry = next
  })

  return removed
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

export function addLowPolyShanghai(
  scene: THREE.Scene,
  initialPlacement: Partial<LowPolyShanghaiPlacement> = {},
): LowPolyShanghaiBundle {
  const group = new THREE.Group()
  group.name = 'lowpoly-shanghai-root'
  scene.add(group)

  const placement: LowPolyShanghaiPlacement = {
    ...LOW_POLY_SHANGHAI_PLACEMENT,
    ...initialPlacement,
  }

  const applyPlacement = (): void => {
    group.position.set(placement.x, placement.y, placement.z)
    group.rotation.y = THREE.MathUtils.degToRad(placement.yawDeg)
    group.scale.setScalar(Math.max(0.001, placement.scale))
  }
  applyPlacement()

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  loader.setDRACOLoader(getDracoLoader())
  const ready = new Promise<LowPolyShanghaiLoadResult>((resolve, reject) => {
    loader.load(
      lowPolyShanghaiUrl,
      (gltf) => {
        const model = gltf.scene
        model.name = 'shanghai-international-circuit-full-model'
        model.updateMatrixWorld(true)

        model.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          obj.castShadow = false
          obj.receiveShadow = meshHasRoadSurfaceHint(obj)
          obj.frustumCulled = true
          obj.visible = !meshIsColliderOnly(obj)
          stripLowRoadsideBannerTriangles(obj)
          stripShanghai50MarkerTriangles(obj)
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of materials) {
            mat.needsUpdate = true
          }
        })

        const initialBox = new THREE.Box3().setFromObject(model)
        const initialCenter = initialBox.getCenter(new THREE.Vector3())
        model.position.x -= initialCenter.x
        model.position.z -= initialCenter.z
        model.position.y -= initialBox.min.y
        group.add(model)

        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        resolve({ model, box, size, center })
      },
      undefined,
      reject,
    )
  })

  return {
    group,
    getPlacement: () => ({ ...placement }),
    setPlacement: (next) => {
      Object.assign(placement, next)
      applyPlacement()
    },
    ready,
  }
}

function materialNameForHit(hit: THREE.Intersection): string {
  const mesh = hit.object as THREE.Mesh
  const mat = mesh.material
  if (!mat) return ''
  if (!Array.isArray(mat)) return mat.name ?? ''
  const index = hit.face?.materialIndex ?? 0
  return mat[index]?.name ?? ''
}

function hitHasRoadHint(hit: THREE.Intersection): boolean {
  const name = `${hit.object.name} ${materialNameForHit(hit)}`.toLowerCase()
  return ROAD_SURFACE_HINTS.some((hint) => name.includes(hint))
}

function hitNormalY(hit: THREE.Intersection): number {
  if (!hit.face) return 0
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
  return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize().y
}

function hitWorldNormal(hit: THREE.Intersection): THREE.Vector3 {
  if (!hit.face) return new THREE.Vector3(0, 1, 0)
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
  return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()
}

function collectRoadSurfaceTargets(root: THREE.Object3D): THREE.Object3D[] {
  const roadTargets: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.driveVisualChunk && meshHasRoadSurfaceHint(obj)) {
      roadTargets.push(obj)
    }
  })
  return roadTargets
}

function collectGroundSurfaceTargets(root: THREE.Object3D): THREE.Object3D[] {
  const groundTargets: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.driveVisualChunk && meshHasGroundSurfaceHint(obj)) {
      groundTargets.push(obj)
    }
  })
  return groundTargets
}

function collectObstacleSurfaceTargets(root: THREE.Object3D): THREE.Object3D[] {
  const obstacleTargets: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.driveVisualChunk && meshHasObstacleSurfaceHint(obj)) {
      obstacleTargets.push(obj)
    }
  })
  return obstacleTargets
}

export function createLowPolyShanghaiObstacleSampler(
  lowPolyShanghai: LowPolyShanghaiBundle,
): LowPolyShanghaiObstacleSampler {
  const obstacleTargets = collectObstacleSurfaceTargets(lowPolyShanghai.group)
  const cellSize = 8
  const maxPointsPerMesh = 6000
  const maxPointsPerCell = 36
  const grid = new Map<string, THREE.Vector3[]>()
  const tmp = new THREE.Vector3()

  const cellKey = (x: number, z: number): string => `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`
  const addPoint = (point: THREE.Vector3): void => {
    const key = cellKey(point.x, point.z)
    const bucket = grid.get(key)
    if (bucket) {
      if (bucket.length >= maxPointsPerCell) return
      bucket.push(point.clone())
    } else {
      grid.set(key, [point.clone()])
    }
  }

  lowPolyShanghai.group.updateMatrixWorld(true)
  for (const target of obstacleTargets) {
    if (!(target instanceof THREE.Mesh)) continue
    const position = target.geometry.getAttribute('position')
    if (!position) continue
    const step = Math.max(1, Math.floor(position.count / maxPointsPerMesh))
    for (let i = 0; i < position.count; i += step) {
      tmp.fromBufferAttribute(position, i).applyMatrix4(target.matrixWorld)
      if (Number.isFinite(tmp.x) && Number.isFinite(tmp.y) && Number.isFinite(tmp.z)) {
        addPoint(tmp)
      }
    }
  }

  const sampleObstacleNear = (
    point: THREE.Vector3,
    options: LowPolyShanghaiObstacleQuery = {},
  ): LowPolyShanghaiObstacleHit | null => {
    if (grid.size === 0) return null
    const radius = options.radius ?? 1.1
    const queryRadius = radius + 0.85
    const queryRadiusSq = queryRadius * queryRadius
    const minCellX = Math.floor((point.x - queryRadius) / cellSize)
    const maxCellX = Math.floor((point.x + queryRadius) / cellSize)
    const minCellZ = Math.floor((point.z - queryRadius) / cellSize)
    const maxCellZ = Math.floor((point.z + queryRadius) / cellSize)
    const minY = point.y - 0.8
    const maxY = point.y + 3.2
    let closest: LowPolyShanghaiObstacleHit | null = null

    for (let ix = minCellX; ix <= maxCellX; ix++) {
      for (let iz = minCellZ; iz <= maxCellZ; iz++) {
        const bucket = grid.get(`${ix}:${iz}`)
        if (!bucket) continue
        for (const candidate of bucket) {
          if (candidate.y < minY || candidate.y > maxY) continue
          const dx = point.x - candidate.x
          const dz = point.z - candidate.z
          const dSq = dx * dx + dz * dz
          if (dSq > queryRadiusSq) continue
          if (!closest || dSq < closest.distance * closest.distance) {
            const normal = new THREE.Vector3(dx, 0, dz)
            if (normal.lengthSq() < 1e-5) {
              normal.copy(options.side ?? new THREE.Vector3(1, 0, 0))
            }
            normal.normalize()
            closest = {
              point: candidate.clone(),
              normal,
              distance: Math.sqrt(dSq),
            }
          }
        }
      }
    }

    return closest
  }

  const sampleObstacleBetween = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    options: LowPolyShanghaiObstacleQuery = {},
  ): LowPolyShanghaiObstacleHit | null => {
    tmp.copy(to)
    if (from.distanceToSquared(to) > 0.001) {
      tmp.lerp(from, 0.25)
    }
    return sampleObstacleNear(tmp, options) ?? sampleObstacleNear(to, options)
  }

  return { sampleObstacleBetween, sampleObstacleNear }
}

export function createLowPolyShanghaiGroundSampler(
  lowPolyShanghai: LowPolyShanghaiBundle,
): LowPolyShanghaiGroundSampler {
  const raycaster = new THREE.Raycaster()
  const origin = new THREE.Vector3()
  const down = new THREE.Vector3(0, -1, 0)
  const roadTargets = collectRoadSurfaceTargets(lowPolyShanghai.group)
  const groundTargets = collectGroundSurfaceTargets(lowPolyShanghai.group)
  const cache = new Map<string, LowPolyShanghaiGroundHit | null>()
  let lastPlacementKey = ''
  let matrixWorldFresh = false

  const placementKey = (): string => {
    const p = lowPolyShanghai.getPlacement()
    return `${p.x}:${p.y}:${p.z}:${p.yawDeg}:${p.scale}`
  }

  const sampleGroundAt = (x: number, z: number): LowPolyShanghaiGroundHit | null => {
    const keyNow = placementKey()
    if (keyNow !== lastPlacementKey) {
      cache.clear()
      lastPlacementKey = keyNow
      matrixWorldFresh = false
    }
    const key = `${Math.round(x * 2)}:${Math.round(z * 2)}`
    if (cache.has(key)) {
      const cached = cache.get(key)
      return cached
        ? { point: cached.point.clone(), normal: cached.normal.clone(), isRoad: cached.isRoad }
        : null
    }

    if (!matrixWorldFresh) {
      lowPolyShanghai.group.updateMatrixWorld(true)
      matrixWorldFresh = true
    }
    origin.set(x, 3000, z)
    raycaster.set(origin, down)
    raycaster.near = 0
    raycaster.far = 6000
    const targets = groundTargets.length ? groundTargets : (roadTargets.length ? roadTargets : [lowPolyShanghai.group])
    const hits = raycaster.intersectObjects(targets, true)
    const roadHit = hits.find((hit) => hitHasRoadHint(hit) && hitNormalY(hit) > 0.25)
    const fallbackHit = roadHit ?? hits.find((hit) => hitNormalY(hit) > 0.25) ?? null
    if (!fallbackHit) {
      cache.set(key, null)
      return null
    }

    const result: LowPolyShanghaiGroundHit = {
      point: fallbackHit.point.clone(),
      normal: hitWorldNormal(fallbackHit),
      isRoad: roadHit !== undefined,
    }
    cache.set(key, result)
    return { point: result.point.clone(), normal: result.normal.clone(), isRoad: result.isRoad }
  }

  return { sampleGroundAt }
}

export async function createLowPolyShanghaiGroundGridSampler(
  lowPolyShanghai: LowPolyShanghaiBundle,
  options: LowPolyShanghaiGroundGridOptions = {},
): Promise<LowPolyShanghaiGroundSampler> {
  const cellSize = options.cellSize ?? 8
  const startedAt = performance.now()
  const timeBudgetMs = options.timeBudgetMs ?? Number.POSITIVE_INFINITY
  const rawSampler = createLowPolyShanghaiGroundSampler(lowPolyShanghai)
  const box = new THREE.Box3().setFromObject(lowPolyShanghai.group)
  const minX = Math.floor((box.min.x - 24) / cellSize) * cellSize
  const maxX = Math.ceil((box.max.x + 24) / cellSize) * cellSize
  const minZ = Math.floor((box.min.z - 24) / cellSize) * cellSize
  const maxZ = Math.ceil((box.max.z + 24) / cellSize) * cellSize
  const cols = Math.max(2, Math.ceil((maxX - minX) / cellSize) + 1)
  const rows = Math.max(2, Math.ceil((maxZ - minZ) / cellSize) + 1)
  const total = cols * rows
  const y = new Float32Array(total)
  const nx = new Float32Array(total)
  const ny = new Float32Array(total)
  const nz = new Float32Array(total)
  const hit = new Uint8Array(total)
  const road = new Uint8Array(total)

  const idx = (col: number, row: number): number => row * cols + col
  for (let row = 0; row < rows; row++) {
    if (performance.now() - startedAt > timeBudgetMs) {
      throw new Error(`ground grid bake exceeded ${Math.round(timeBudgetMs)}ms`)
    }
    for (let col = 0; col < cols; col++) {
      const sample = rawSampler.sampleGroundAt(minX + col * cellSize, minZ + row * cellSize)
      const i = idx(col, row)
      if (!sample) {
        y[i] = 0
        ny[i] = 1
        continue
      }
      hit[i] = 1
      road[i] = sample.isRoad ? 1 : 0
      y[i] = sample.point.y
      nx[i] = sample.normal.x
      ny[i] = sample.normal.y
      nz[i] = sample.normal.z
    }
    if (row % 3 === 0) {
      options.onProgress?.((row + 1) / rows, 'baking ground')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
  }
  options.onProgress?.(1, 'ground ready')

  const nearestValid = (col: number, row: number): number => {
    const baseCol = Math.max(0, Math.min(cols - 1, col))
    const baseRow = Math.max(0, Math.min(rows - 1, row))
    let best = -1
    let bestD = Infinity
    for (let r = 0; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue
          const c = baseCol + dx
          const rr = baseRow + dz
          if (c < 0 || c >= cols || rr < 0 || rr >= rows) continue
          const i = idx(c, rr)
          if (!hit[i]) continue
          const d = dx * dx + dz * dz
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
      }
      if (best >= 0) return best
    }
    return -1
  }

  const sampleGroundAt = (x: number, z: number): LowPolyShanghaiGroundHit | null => {
    const gx = (x - minX) / cellSize
    const gz = (z - minZ) / cellSize
    const col0 = Math.floor(gx)
    const row0 = Math.floor(gz)
    const tx = gx - col0
    const tz = gz - row0
    if (col0 < 0 || row0 < 0 || col0 >= cols - 1 || row0 >= rows - 1) return null
    const i00 = idx(col0, row0)
    const i10 = idx(col0 + 1, row0)
    const i01 = idx(col0, row0 + 1)
    const i11 = idx(col0 + 1, row0 + 1)
    const allHit = hit[i00] && hit[i10] && hit[i01] && hit[i11]

    if (!allHit) {
      const nearest = nearestValid(Math.round(gx), Math.round(gz))
      if (nearest < 0) return null
      return {
        point: new THREE.Vector3(x, y[nearest], z),
        normal: new THREE.Vector3(nx[nearest], ny[nearest], nz[nearest]).normalize(),
        isRoad: road[nearest] === 1,
      }
    }

    const w00 = (1 - tx) * (1 - tz)
    const w10 = tx * (1 - tz)
    const w01 = (1 - tx) * tz
    const w11 = tx * tz
    const sy = y[i00] * w00 + y[i10] * w10 + y[i01] * w01 + y[i11] * w11
    const normal = new THREE.Vector3(
      nx[i00] * w00 + nx[i10] * w10 + nx[i01] * w01 + nx[i11] * w11,
      ny[i00] * w00 + ny[i10] * w10 + ny[i01] * w01 + ny[i11] * w11,
      nz[i00] * w00 + nz[i10] * w10 + nz[i01] * w01 + nz[i11] * w11,
    ).normalize()
    const roadWeight = road[i00] * w00 + road[i10] * w10 + road[i01] * w01 + road[i11] * w11
    return {
      point: new THREE.Vector3(x, sy, z),
      normal,
      isRoad: roadWeight >= 0.5,
    }
  }

  return { sampleGroundAt }
}

export function createLowPolyShanghaiSurfaceSampler(
  lowPolyShanghai: LowPolyShanghaiBundle,
  options: { verticalOffset?: number } = {},
): LowPolyShanghaiSurfaceSampler {
  const groundSampler = createLowPolyShanghaiGroundSampler(lowPolyShanghai)
  const verticalOffset = options.verticalOffset ?? 0.06

  const sampleHeightAt = (x: number, z: number, fallbackY = 0): number | null => {
    const hit = groundSampler.sampleGroundAt(x, z)
    return hit ? hit.point.y + verticalOffset : fallbackY
  }

  return { sampleHeightAt }
}

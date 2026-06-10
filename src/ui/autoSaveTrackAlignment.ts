import * as THREE from 'three'
import type { SceneBundle } from '../render/scene'
import {
  AUTOSAVE_MAP_TRACK_LOCAL_POINTS,
  AUTOSAVE_TRACK_WIDTH_SCALE,
  DEFAULT_AUTOSAVE_LEGACY_TRACK_TRANSFORM,
  autoSaveMapTrackPoint,
  autoSaveMapWorldToLocal,
  buildAutoSaveLegacyTrackCopy,
  type AutoSaveLegacyTrackTransform,
  type AutoSaveTrackLocalPoint,
} from '../render/track'

const STORAGE_KEY = 'f1s_autosave_track_local_points'

interface TrackAlignmentReferenceModel {
  group: THREE.Group
  ready: Promise<{ box: THREE.Box3 }>
}

interface AlignmentState {
  points: AutoSaveTrackLocalPoint[]
  selected: number
  modelOpacity: number
  showModel: boolean
  showFenceCloud: boolean
  addMode: boolean
  legacyTransform: AutoSaveLegacyTrackTransform
}

export function isAutoSaveTrackAlignmentGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('autoSaveTrackGui')
    || params.has('autoSaveTraceGui')
    || params.has('autoSaveRouteGui')
    || params.has('alignAutoSaveTrack')
}

function clonePoints(points: AutoSaveTrackLocalPoint[]): AutoSaveTrackLocalPoint[] {
  return points.map(([along, lateral]) => [along, lateral])
}

function translatePoints(points: AutoSaveTrackLocalPoint[], along: number, lateral: number): void {
  for (const point of points) {
    point[0] += along
    point[1] += lateral
  }
}

function rotatePointsAround(
  points: AutoSaveTrackLocalPoint[],
  pivot: AutoSaveTrackLocalPoint,
  yawDeg: number,
): void {
  const yaw = THREE.MathUtils.degToRad(yawDeg)
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  for (const point of points) {
    const along = point[0] - pivot[0]
    const lateral = point[1] - pivot[1]
    point[0] = pivot[0] + along * cos - lateral * sin
    point[1] = pivot[1] + along * sin + lateral * cos
  }
}

function scalePointsAround(
  points: AutoSaveTrackLocalPoint[],
  pivot: AutoSaveTrackLocalPoint,
  scale: number,
): void {
  if (!Number.isFinite(scale) || scale <= 0) return
  for (const point of points) {
    point[0] = pivot[0] + (point[0] - pivot[0]) * scale
    point[1] = pivot[1] + (point[1] - pivot[1]) * scale
  }
}

function shortestSegmentIndices(a: number, b: number, count: number): number[] {
  if (count <= 0 || a === b) return []
  const forwardSteps = (b - a + count) % count
  const backwardSteps = (a - b + count) % count
  const start = forwardSteps <= backwardSteps ? a : b
  const steps = Math.min(forwardSteps, backwardSteps)
  const indices: number[] = []
  for (let i = 0; i <= steps; i++) indices.push((start + i) % count)
  return indices
}

function isPointArray(value: unknown): value is AutoSaveTrackLocalPoint[] {
  return Array.isArray(value) && value.every((p) =>
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]),
  )
}

export function readSavedAutoSaveTrackLocalPoints(): AutoSaveTrackLocalPoint[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isPointArray(parsed) && parsed.length >= 4 ? clonePoints(parsed) : null
  } catch {
    return null
  }
}

function writeSavedAutoSaveTrackLocalPoints(points: AutoSaveTrackLocalPoint[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(points))
  } catch {
    /* noop */
  }
}

function fmt(value: number, digits = 1): number {
  return Number(value.toFixed(digits))
}

function pointsSnippet(points: AutoSaveTrackLocalPoint[]): string {
  return [
    'const AUTOSAVE_MAP_TRACK_LOCAL_POINTS: AutoSaveTrackLocalPoint[] = [',
    ...points.map(([along, lateral]) => `  [${fmt(along)}, ${fmt(lateral)}],`),
    ']',
  ].join('\n')
}

function makeTrackPreview(
  points: AutoSaveTrackLocalPoint[],
  selected: number,
  straightAnchors: number[] = [],
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'autosave-track-edit-preview'
  const worldPoints = points.map(([along, lateral]) => autoSaveMapTrackPoint(along, lateral))
  const pointGeo = new THREE.SphereGeometry(6, 16, 10)
  const addMarkers = (): void => {
    for (let i = 0; i < worldPoints.length; i++) {
      const isSelected = i === selected
      const isStraightAnchor = straightAnchors.includes(i)
      const mat = new THREE.MeshBasicMaterial({
        color: isStraightAnchor ? '#fff176' : '#ffdf3d',
        depthTest: false,
      })
      const marker = new THREE.Mesh(pointGeo, mat)
      marker.name = `autosave-track-point-${i}`
      marker.position.copy(worldPoints[i])
      marker.position.y += isStraightAnchor ? 16 : isSelected ? 14 : 10
      marker.scale.setScalar(isStraightAnchor ? 1.65 : isSelected ? 1.42 : 1.12)
      marker.userData.pointIndex = i
      marker.renderOrder = 180
      group.add(marker)
    }
  }

  const addStraightGuide = (): void => {
    if (straightAnchors.length !== 2) return
    const a = worldPoints[straightAnchors[0]]
    const b = worldPoints[straightAnchors[1]]
    if (!a || !b) return
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      a.x, a.y + 1.1, a.z,
      b.x, b.y + 1.1, b.z,
    ], 3))
    const lineMat = new THREE.LineBasicMaterial({
      color: '#fff176',
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    })
    const line = new THREE.Line(lineGeo, lineMat)
    line.name = 'autosave-straighten-guide'
    line.renderOrder = 170
    group.add(line)
  }

  if (worldPoints.length < 3) {
    if (worldPoints.length === 2) {
      const lineGeo = new THREE.BufferGeometry()
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        worldPoints[0].x, worldPoints[0].y + 0.18, worldPoints[0].z,
        worldPoints[1].x, worldPoints[1].y + 0.18, worldPoints[1].z,
      ], 3))
      const lineMat = new THREE.LineBasicMaterial({
        color: '#00f5ff',
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      })
      const line = new THREE.Line(lineGeo, lineMat)
      line.name = 'autosave-edit-open-centerline'
      line.renderOrder = 140
      group.add(line)
    }
    addStraightGuide()
    addMarkers()
    return group
  }

  const curve = new THREE.CatmullRomCurve3(worldPoints, true, 'centripetal')
  const samples = 720
  const roadHalf = 7 * AUTOSAVE_TRACK_WIDTH_SCALE
  const kerb = 2 * AUTOSAVE_TRACK_WIDTH_SCALE
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const roadColor = new THREE.Color('#59606a')
  const red = new THREE.Color('#e31717')
  const white = new THREE.Color('#f4f4f0')

  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const p = curve.getPointAt(t % 1)
    const tg = curve.getTangentAt(t % 1).normalize()
    const lat = new THREE.Vector3(-tg.z, 0, tg.x).normalize()
    const y = p.y + 0.025 + i * 0.00002
    const leftKerb = p.clone().addScaledVector(lat, -(roadHalf + kerb))
    const left = p.clone().addScaledVector(lat, -roadHalf)
    const right = p.clone().addScaledVector(lat, roadHalf)
    const rightKerb = p.clone().addScaledVector(lat, roadHalf + kerb)
    positions.push(leftKerb.x, y, leftKerb.z, left.x, y, left.z, right.x, y, right.z, rightKerb.x, y, rightKerb.z)
    const stripe = Math.floor(i / 4) % 2 === 0 ? red : white
    colors.push(stripe.r, stripe.g, stripe.b, roadColor.r, roadColor.g, roadColor.b, roadColor.r, roadColor.g, roadColor.b, stripe.r, stripe.g, stripe.b)
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 4
    const b = (i + 1) * 4
    for (let q = 0; q < 3; q++) {
      indices.push(a + q, a + q + 1, b + q, a + q + 1, b + q + 1, b + q)
    }
  }
  const roadGeo = new THREE.BufferGeometry()
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  roadGeo.setIndex(indices)
  roadGeo.computeVertexNormals()
  const roadMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const road = new THREE.Mesh(roadGeo, roadMat)
  road.name = 'autosave-edit-road-ribbon'
  road.renderOrder = 100
  group.add(road)

  const centerPositions: number[] = []
  for (let i = 0; i <= samples; i++) {
    const p = curve.getPointAt((i / samples) % 1)
    centerPositions.push(p.x, p.y + 0.18, p.z)
  }
  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(centerPositions, 3))
  const lineMat = new THREE.LineBasicMaterial({
    color: '#00f5ff',
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  })
  const line = new THREE.Line(lineGeo, lineMat)
  line.name = 'autosave-edit-centerline'
  line.renderOrder = 140
  group.add(line)

  addStraightGuide()
  addMarkers()

  return group
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) {
      for (const mat of material) mat.dispose()
    } else if (material) {
      material.dispose()
    }
  })
}

function smoothOnce(points: AutoSaveTrackLocalPoint[]): AutoSaveTrackLocalPoint[] {
  const n = points.length
  if (n < 3) return clonePoints(points)
  return points.map(([along, lateral], i) => {
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    return [
      prev[0] * 0.18 + along * 0.64 + next[0] * 0.18,
      prev[1] * 0.18 + lateral * 0.64 + next[1] * 0.18,
    ]
  })
}

function smoothClosed(points: AutoSaveTrackLocalPoint[], passes: number): AutoSaveTrackLocalPoint[] {
  let result = clonePoints(points)
  for (let i = 0; i < passes; i++) result = smoothOnce(result)
  return result
}

function resampleClosed(points: AutoSaveTrackLocalPoint[], count: number): AutoSaveTrackLocalPoint[] {
  if (points.length < 3) return clonePoints(points)
  const curve = new THREE.CatmullRomCurve3(
    points.map(([along, lateral]) => new THREE.Vector3(along, 0, lateral)),
    true,
    'centripetal',
  )
  const output: AutoSaveTrackLocalPoint[] = []
  for (let i = 0; i < count; i++) {
    const p = curve.getPointAt(i / count)
    output.push([p.x, p.z])
  }
  return output
}

function repairTrace(points: AutoSaveTrackLocalPoint[], count = 64): AutoSaveTrackLocalPoint[] {
  if (points.length < 4) return clonePoints(points)
  return smoothClosed(resampleClosed(smoothClosed(points, 1), count), 2)
}

function materialNameOf(mesh: THREE.Mesh, materialIndex: number): string {
  const material = Array.isArray(mesh.material)
    ? mesh.material[materialIndex] ?? mesh.material[0]
    : mesh.material
  return material?.name ?? ''
}

function isFenceLikeMaterial(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes('fenc')
    || lower.includes('barrier')
    || lower.includes('tyre')
    || lower === '*32'
    || lower === '*7'
}

function extractFenceReferencePoints(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true)
  const points: THREE.Vector3[] = []
  const seen = new Set<string>()
  const temp = new THREE.Vector3()
  const addPoint = (mesh: THREE.Mesh, vertexIndex: number): void => {
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return
    temp.fromBufferAttribute(pos, vertexIndex).applyMatrix4(mesh.matrixWorld)
    // Main trackside fences / low barrier features live close to ground.
    // This skips high grandstand railings and roof trims.
    if (temp.y < 0.15 || temp.y > 5.8) return
    const key = `${Math.round(temp.x / 5)},${Math.round(temp.z / 5)}`
    if (seen.has(key)) return
    seen.add(key)
    points.push(temp.clone())
  }

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const geometry = obj.geometry
    const index = geometry.index
    const pos = geometry.getAttribute('position')
    if (!pos) return
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }]

    for (const group of groups) {
      if (!isFenceLikeMaterial(materialNameOf(obj, group.materialIndex ?? 0))) continue
      const stride = 3
      for (let offset = group.start; offset < group.start + group.count; offset += stride) {
        const vertexIndex = index ? index.getX(offset) : offset
        addPoint(obj, vertexIndex)
      }
    }
  })

  return points
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function quantile(values: number[], t: number): number {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * t)))
  return sorted[index]
}

function rotateToNearestStart(points: AutoSaveTrackLocalPoint[]): AutoSaveTrackLocalPoint[] {
  if (points.length === 0) return points
  const target = AUTOSAVE_MAP_TRACK_LOCAL_POINTS[0]
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < points.length; i++) {
    const dx = points[i][0] - target[0]
    const dz = points[i][1] - target[1]
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return points.slice(best).concat(points.slice(0, best))
}

function orientDetectedPoints(points: AutoSaveTrackLocalPoint[]): AutoSaveTrackLocalPoint[] {
  let oriented = rotateToNearestStart(points)
  if (oriented.length < 2) return oriented
  if (oriented[1][0] < oriented[0][0]) {
    oriented = rotateToNearestStart(oriented.slice().reverse())
  }
  return oriented
}

function estimateTrackFromFencePoints(fencePoints: THREE.Vector3[]): AutoSaveTrackLocalPoint[] {
  if (fencePoints.length < 24) return clonePoints(AUTOSAVE_MAP_TRACK_LOCAL_POINTS)
  const xs = fencePoints.map((p) => p.x)
  const zs = fencePoints.map((p) => p.z)
  const cx = median(xs)
  const cz = median(zs)
  const sectorCount = 96
  const sectors: number[][] = Array.from({ length: sectorCount }, () => [])
  for (const p of fencePoints) {
    const angle = (Math.atan2(p.z - cz, p.x - cx) + Math.PI * 2) % (Math.PI * 2)
    const radius = Math.hypot(p.x - cx, p.z - cz)
    sectors[Math.floor((angle / (Math.PI * 2)) * sectorCount)].push(radius)
  }

  const worldRoute: THREE.Vector3[] = []
  for (let i = 0; i < sectorCount; i++) {
    let radii: number[] = []
    for (let k = -1; k <= 1; k++) {
      radii = radii.concat(sectors[(i + k + sectorCount) % sectorCount])
    }
    if (radii.length < 3) continue
    // Use the middle radial band rather than the outer hull. For this GLB,
    // the actual route is indicated by repeated low vertical fences, while
    // the absolute outer hull is often just perimeter clutter.
    const inner = quantile(radii, 0.22)
    const outer = quantile(radii, 0.78)
    const radius = (inner + outer) / 2
    const angle = ((i + 0.5) / sectorCount) * Math.PI * 2
    worldRoute.push(new THREE.Vector3(
      cx + Math.cos(angle) * radius,
      0.14,
      cz + Math.sin(angle) * radius,
    ))
  }

  if (worldRoute.length < 8) return clonePoints(AUTOSAVE_MAP_TRACK_LOCAL_POINTS)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < worldRoute.length; i++) {
      const prev = worldRoute[(i - 1 + worldRoute.length) % worldRoute.length]
      const current = worldRoute[i]
      const next = worldRoute[(i + 1) % worldRoute.length]
      current.x = prev.x * 0.18 + current.x * 0.64 + next.x * 0.18
      current.z = prev.z * 0.18 + current.z * 0.64 + next.z * 0.18
    }
  }

  const outputCount = Math.min(48, Math.max(24, Math.round(worldRoute.length / 2)))
  const local: AutoSaveTrackLocalPoint[] = []
  for (let i = 0; i < outputCount; i++) {
    const p = worldRoute[Math.floor((i / outputCount) * worldRoute.length) % worldRoute.length]
    local.push(autoSaveMapWorldToLocal(p))
  }
  return orientDetectedPoints(local)
}

function makeFenceCloud(points: THREE.Vector3[]): THREE.Points {
  const positions: number[] = []
  for (const p of points) positions.push(p.x, 0.65, p.z)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: '#f8fbff',
    size: 4.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.62,
    depthTest: false,
    depthWrite: false,
  })
  const cloud = new THREE.Points(geo, mat)
  cloud.name = 'autosave-fence-reference-cloud'
  cloud.renderOrder = 130
  return cloud
}

export function installAutoSaveTrackAlignmentGui(
  bundle: SceneBundle,
  referenceModel: TrackAlignmentReferenceModel | null,
): () => void {
  bundle.scene.background = new THREE.Color('#202833')
  bundle.scene.fog = null

  const saved = readSavedAutoSaveTrackLocalPoints()
  const params = new URLSearchParams(window.location.search)
  const runAutoDetectOnReady = params.has('detect') || params.has('autoDetect')
  const startFromBlank = params.has('manual') || params.has('trace') || params.has('blank')
  const startFromLegacy = params.has('legacy') || params.has('oldTrack') || params.has('copyOldTrack')
  const legacyPoints = buildAutoSaveLegacyTrackCopy(DEFAULT_AUTOSAVE_LEGACY_TRACK_TRANSFORM)
  const state: AlignmentState = {
    points: startFromBlank
      ? []
      : (startFromLegacy ? legacyPoints : (saved ?? clonePoints(AUTOSAVE_MAP_TRACK_LOCAL_POINTS))),
    selected: 0,
    modelOpacity: 0.55,
    showModel: true,
    showFenceCloud: true,
    addMode: startFromBlank,
    legacyTransform: { ...DEFAULT_AUTOSAVE_LEGACY_TRACK_TRANSFORM },
  }

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.14)
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const dom = bundle.renderer.domElement
  const cameraTarget = new THREE.Vector3()
  let preview: THREE.Group | null = null
  let fencePoints: THREE.Vector3[] = []
  let fenceCloud: THREE.Points | null = null
  let mapBox: THREE.Box3 | null = null
  let draggingIndex: number | null = null
  let panning = false
  let lastScreen: { x: number; y: number } | null = null
  let straightSelectMode = false
  let straightAnchorIndices: number[] = []
  let straightModeButton: HTMLButtonElement | null = null

  const setModelAppearance = (): void => {
    if (!referenceModel) return
    referenceModel.group.visible = state.showModel
    referenceModel.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of materials) {
        mat.transparent = state.modelOpacity < 1
        mat.opacity = state.modelOpacity
        mat.depthWrite = state.modelOpacity >= 0.98
        mat.needsUpdate = true
      }
    })
  }

  const output = document.createElement('pre')
  output.style.cssText = `
    margin: 10px 0 0; padding: 10px; border-radius: 6px;
    background: rgba(255,255,255,0.08); color: #dff;
    font-size: 11px; white-space: pre-wrap; user-select: text;
  `

  const setCamera = (mode: 'top' | 'start' | 'wide'): void => {
    const worldPoints = state.points.map(([along, lateral]) => autoSaveMapTrackPoint(along, lateral))
    const box = new THREE.Box3()
    if (worldPoints.length > 0) {
      for (const p of worldPoints) box.expandByPoint(p)
    } else if (mapBox) {
      box.copy(mapBox)
    } else {
      box.setFromCenterAndSize(new THREE.Vector3(-350, 0, -80), new THREE.Vector3(1000, 1, 1000))
    }
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const start = worldPoints[0] ?? center
    const next = worldPoints[1] ?? center.clone().add(new THREE.Vector3(0, 0, -1))
    const tg = next.clone().sub(start).normalize()
    const lat = new THREE.Vector3(-tg.z, 0, tg.x).normalize()
    const cam = bundle.camera
    cam.fov = mode === 'top' ? 36 : 64
    if (mode === 'top') {
      box.expandByScalar(40)
      box.getSize(size)
      const rect = dom.getBoundingClientRect()
      const aspect = Math.max(0.1, rect.width / Math.max(1, rect.height))
      const halfVFov = THREE.MathUtils.degToRad(cam.fov / 2)
      const halfHFov = Math.atan(Math.tan(halfVFov) * aspect)
      const requiredForHeight = Math.max(120, size.z / 2) / Math.tan(halfVFov)
      const requiredForWidth = Math.max(120, size.x / 2) / Math.tan(halfHFov)
      const height = Math.min(4800, Math.max(320, Math.max(requiredForHeight, requiredForWidth) * 1.18))
      cam.near = 1
      cam.far = Math.max(cam.far, height * 2.4)
      cam.position.set(center.x, height, center.z + 0.1)
      cameraTarget.set(center.x, 0, center.z)
    } else if (mode === 'wide') {
      cam.position.copy(start).addScaledVector(tg, -360).addScaledVector(lat, 240)
      cam.position.y = 260
      cameraTarget.set(center.x, 0, center.z)
    } else {
      cam.position.copy(start).addScaledVector(tg, -190).addScaledVector(lat, 42)
      cam.position.y = 74
      cameraTarget.set(start.x + tg.x * 20, 16, start.z + tg.z * 20)
    }
    cam.lookAt(cameraTarget)
    cam.updateProjectionMatrix()
  }

  const zoomCamera = (factor: number): void => {
    const cam = bundle.camera
    const offset = cam.position.clone().sub(cameraTarget)
    const distance = THREE.MathUtils.clamp(offset.length() * factor, 35, 3600)
    offset.setLength(distance)
    cam.position.copy(cameraTarget).add(offset)
    cam.lookAt(cameraTarget)
    cam.updateProjectionMatrix()
  }

  const panCamera = (dx: number, dy: number): void => {
    const rect = dom.getBoundingClientRect()
    const cam = bundle.camera
    const distance = cam.position.distanceTo(cameraTarget)
    const worldPerPixel =
      (2 * distance * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) /
      Math.max(1, rect.height)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
    const shift = right
      .multiplyScalar(-dx * worldPerPixel)
      .add(up.multiplyScalar(dy * worldPerPixel))
    cam.position.add(shift)
    cameraTarget.add(shift)
    cam.lookAt(cameraTarget)
  }

  const refresh = (save = true): void => {
    if (preview) {
      bundle.scene.remove(preview)
      disposeObject(preview)
    }
    preview = makeTrackPreview(state.points, state.selected, straightAnchorIndices)
    bundle.scene.add(preview)
    output.textContent = pointsSnippet(state.points)
    if (save) writeSavedAutoSaveTrackLocalPoints(state.points)
    setModelAppearance()
    if (fenceCloud) fenceCloud.visible = state.showFenceCloud
  }

  const rebuildFenceCloud = (): void => {
    if (fenceCloud) {
      bundle.scene.remove(fenceCloud)
      disposeObject(fenceCloud)
      fenceCloud = null
    }
    if (fencePoints.length === 0) return
    fenceCloud = makeFenceCloud(fencePoints)
    fenceCloud.visible = state.showFenceCloud
    bundle.scene.add(fenceCloud)
  }

  const autoDetectFromMap = (): void => {
    if (!referenceModel) return
    fencePoints = extractFenceReferencePoints(referenceModel.group)
    rebuildFenceCloud()
    state.points = estimateTrackFromFencePoints(fencePoints)
    state.selected = 0
    straightAnchorIndices = []
    straightSelectMode = false
    updateSelectedLabel()
    refresh()
    setCamera('top')
  }

  const host = document.createElement('div')
  host.style.cssText = `
    position: fixed; right: 16px; top: 16px; z-index: 240;
    width: min(390px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    overflow: auto; padding: 14px;
    background: rgba(8,12,20,0.92); color: #fff;
    border: 1px solid rgba(255,255,255,0.16); border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    box-shadow: 0 16px 40px rgba(0,0,0,0.38);
  `

  const title = document.createElement('div')
  title.textContent = '上海赛车场赛道对齐'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px;'
  host.appendChild(title)

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  const updateHint = (): void => {
    if (straightSelectMode) {
      hint.textContent = '拉直端点选择中：依次点击两个黄色节点，再点“拉直选中段”。“全赛道”可完整适配视图。'
      return
    }
    hint.textContent = state.addMode
      ? '加点模式开启：点空白处新增点；黄色节点可拖动。“全赛道”完整适配，滚轮缩放。'
      : '编辑模式：所有黄色节点都可拖动；第 1 个点是发车点；“全赛道”完整适配，必要时收起面板查看全图。'
  }
  updateHint()
  host.appendChild(hint)

  const selectedLabel = document.createElement('div')
  selectedLabel.style.cssText = 'font-size:12px;color:#ccd;margin:8px 0;'
  const updateSelectedLabel = (): void => {
    const p = state.points[state.selected]
    const anchorText = straightAnchorIndices.length > 0
      ? ` / 拉直端点 ${straightAnchorIndices.map((index) => index + 1).join('、')}`
      : ''
    selectedLabel.textContent = p
      ? `选中点 ${state.selected + 1}/${state.points.length}${state.selected === 0 ? ' 发车点' : ''}: along ${fmt(p[0])}, lateral ${fmt(p[1])}${anchorText}`
      : '未选中'
  }
  host.appendChild(selectedLabel)

  const addRange = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onInput: (value: number) => void,
  ): void => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:86px 1fr 72px;gap:8px;align-items:center;margin:8px 0;'
    const text = document.createElement('span')
    text.textContent = label
    text.style.cssText = 'font-size:12px;color:#ccd;'
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(value)
    const number = document.createElement('input')
    number.type = 'number'
    number.min = String(min)
    number.max = String(max)
    number.step = String(step)
    number.value = String(value)
    number.style.cssText = 'width:70px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px;'
    const applyValue = (raw: string): void => {
      const next = Number(raw)
      if (!Number.isFinite(next)) return
      input.value = String(next)
      number.value = String(next)
      onInput(next)
    }
    input.addEventListener('input', () => applyValue(input.value))
    number.addEventListener('input', () => applyValue(number.value))
    row.append(text, input, number)
    host.appendChild(row)
  }

  const applyWholeTrackTransform = (next: Partial<AutoSaveLegacyTrackTransform>): void => {
    const prev = state.legacyTransform
    let changed = false

    if (next.offsetAlong !== undefined) {
      const value = Number(next.offsetAlong)
      if (Number.isFinite(value)) {
        const delta = value - prev.offsetAlong
        if (delta !== 0) {
          translatePoints(state.points, delta, 0)
          changed = true
        }
        prev.offsetAlong = value
      }
    }

    if (next.offsetLateral !== undefined) {
      const value = Number(next.offsetLateral)
      if (Number.isFinite(value)) {
        const delta = value - prev.offsetLateral
        if (delta !== 0) {
          translatePoints(state.points, 0, delta)
          changed = true
        }
        prev.offsetLateral = value
      }
    }

    if (next.yawDeg !== undefined) {
      const value = Number(next.yawDeg)
      if (Number.isFinite(value)) {
        const delta = value - prev.yawDeg
        if (delta !== 0) {
          const pivot = state.points[0] ?? AUTOSAVE_MAP_TRACK_LOCAL_POINTS[0]
          rotatePointsAround(state.points, pivot, delta)
          changed = true
        }
        prev.yawDeg = value
      }
    }

    if (next.scale !== undefined) {
      const value = Math.max(0.05, Number(next.scale))
      if (Number.isFinite(value)) {
        const ratio = value / Math.max(0.05, prev.scale)
        if (ratio !== 1) {
          const pivot = state.points[0] ?? AUTOSAVE_MAP_TRACK_LOCAL_POINTS[0]
          scalePointsAround(state.points, pivot, ratio)
          changed = true
        }
        prev.scale = value
      }
    }

    if (!changed) return
    updateSelectedLabel()
    refresh()
  }

  addRange('整体沿向', state.legacyTransform.offsetAlong, -900, 900, 1, (value) => {
    applyWholeTrackTransform({ offsetAlong: value })
  })
  addRange('整体横向', state.legacyTransform.offsetLateral, -900, 900, 1, (value) => {
    applyWholeTrackTransform({ offsetLateral: value })
  })
  addRange('整体旋转', state.legacyTransform.yawDeg, -180, 180, 0.1, (value) => {
    applyWholeTrackTransform({ yawDeg: value })
  })
  addRange('整体缩放', state.legacyTransform.scale, 0.2, 2.5, 0.001, (value) => {
    applyWholeTrackTransform({ scale: value })
  })

  addRange('模型透明', state.modelOpacity, 0.1, 1, 0.01, (value) => {
    state.modelOpacity = value
    setModelAppearance()
  })

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;'
  const restorePanelButton = document.createElement('button')
  restorePanelButton.textContent = '显示赛道面板'
  restorePanelButton.style.cssText = `
    position: fixed; right: 16px; top: 16px; z-index: 241; display: none;
    border: 1px solid #22d3ee; background: rgba(8,12,20,0.9); color: #fff;
    border-radius: 6px; padding: 8px 10px; cursor: pointer; font-weight: 800;
  `
  restorePanelButton.addEventListener('click', () => {
    host.style.display = 'block'
    restorePanelButton.style.display = 'none'
  })
  document.body.appendChild(restorePanelButton)
  const addButton = (text: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;'
    btn.addEventListener('click', onClick)
    buttonRow.appendChild(btn)
    return btn
  }

  const setStraightSelectMode = (enabled: boolean): void => {
    straightSelectMode = enabled
    if (straightModeButton) {
      straightModeButton.style.background = enabled ? '#be123c' : '#111827'
      straightModeButton.style.borderColor = enabled ? 'rgba(255,255,255,0.5)' : '#475569'
      straightModeButton.textContent = enabled ? '正在选择端点' : '选择拉直端点'
    }
    updateHint()
  }

  const clearStraightAnchors = (): void => {
    straightAnchorIndices = []
    setStraightSelectMode(false)
    updateSelectedLabel()
  }

  const selectStraightAnchor = (index: number): void => {
    state.selected = index
    const existing = straightAnchorIndices.indexOf(index)
    if (existing >= 0) {
      straightAnchorIndices.splice(existing, 1)
    } else {
      if (straightAnchorIndices.length >= 2) straightAnchorIndices = [straightAnchorIndices[1]]
      straightAnchorIndices.push(index)
    }
    updateSelectedLabel()
    refresh()
  }

  const straightenSelectedSegment = (): void => {
    if (straightAnchorIndices.length !== 2 || state.points.length < 3) return
    const indices = shortestSegmentIndices(
      straightAnchorIndices[0],
      straightAnchorIndices[1],
      state.points.length,
    )
    if (indices.length < 3) return
    const start = state.points[indices[0]]
    const end = state.points[indices[indices.length - 1]]
    const total = indices.length - 1
    for (let i = 1; i < indices.length - 1; i++) {
      const t = i / total
      state.points[indices[i]] = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ]
    }
    state.selected = indices[0]
    straightAnchorIndices = []
    setStraightSelectMode(false)
    updateSelectedLabel()
    refresh()
  }

  addButton('全赛道', () => setCamera('top'))
  addButton('收起面板', () => {
    host.style.display = 'none'
    restorePanelButton.style.display = 'block'
  })
  addButton('发车视角', () => setCamera('start'))
  addButton('远景', () => setCamera('wide'))
  addButton('放大', () => zoomCamera(0.78))
  addButton('缩小', () => zoomCamera(1.28))
  addButton('导入旧赛道副本', () => {
    state.points = buildAutoSaveLegacyTrackCopy(state.legacyTransform)
    state.selected = 0
    state.addMode = false
    clearStraightAnchors()
    updateHint()
    updateSelectedLabel()
    refresh()
    setCamera('top')
  })
  addButton('显示/隐藏模型', () => {
    state.showModel = !state.showModel
    setModelAppearance()
  })
  addButton('开始空白临摹', () => {
    localStorage.removeItem(STORAGE_KEY)
    state.points = []
    state.selected = 0
    state.addMode = true
    clearStraightAnchors()
    updateHint()
    updateSelectedLabel()
    refresh(false)
    setCamera('top')
  })
  addButton('加点开/关', () => {
    state.addMode = !state.addMode
    updateHint()
  })
  addButton('撤销上一点', () => {
    if (state.points.length === 0) return
    state.points.pop()
    state.selected = Math.max(0, state.points.length - 1)
    straightAnchorIndices = straightAnchorIndices.filter((index) => index < state.points.length)
    updateSelectedLabel()
    refresh()
  })
  addButton('自动识别围栏路线', () => {
    if (referenceModel) {
      void referenceModel.ready.then(autoDetectFromMap)
    }
  })
  addButton('显示/隐藏围栏点', () => {
    state.showFenceCloud = !state.showFenceCloud
    if (fenceCloud) fenceCloud.visible = state.showFenceCloud
  })
  addButton('后面加点', () => {
    const nextIndex = (state.selected + 1) % state.points.length
    const a = state.points[state.selected]
    const b = state.points[nextIndex]
    state.points.splice(nextIndex, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    state.selected = nextIndex
    straightAnchorIndices = []
    updateSelectedLabel()
    refresh()
  })
  addButton('删除点', () => {
    if (state.points.length <= 4) return
    state.points.splice(state.selected, 1)
    state.selected = Math.min(state.selected, state.points.length - 1)
    straightAnchorIndices = []
    updateSelectedLabel()
    refresh()
  })
  addButton('设为发车点', () => {
    if (state.selected <= 0 || state.points.length < 2) return
    state.points = state.points.slice(state.selected).concat(state.points.slice(0, state.selected))
    state.selected = 0
    straightAnchorIndices = []
    updateSelectedLabel()
    refresh()
    setCamera('start')
  })
  addButton('反向赛道', () => {
    if (state.points.length < 2) return
    const start = state.points[0]
    state.points = [start, ...state.points.slice(1).reverse()]
    state.selected = 0
    straightAnchorIndices = []
    updateSelectedLabel()
    refresh()
    setCamera('start')
  })
  straightModeButton = addButton('选择拉直端点', () => {
    setStraightSelectMode(!straightSelectMode)
    refresh()
  })
  addButton('拉直选中段', straightenSelectedSegment)
  addButton('清除端点', () => {
    straightAnchorIndices = []
    setStraightSelectMode(false)
    updateSelectedLabel()
    refresh()
  })
  addButton('平滑一次', () => {
    state.points = smoothOnce(state.points)
    updateSelectedLabel()
    refresh()
  })
  addButton('平滑修复闭合', () => {
    state.points = repairTrace(state.points)
    state.selected = 0
    straightAnchorIndices = []
    updateSelectedLabel()
    refresh()
    setCamera('top')
  })
  addButton('重采样64点', () => {
    state.points = resampleClosed(state.points, 64)
    state.selected = 0
    straightAnchorIndices = []
    updateSelectedLabel()
    refresh()
  })
  addButton('复制配置', () => void navigator.clipboard?.writeText(output.textContent ?? ''))
  addButton('重置', () => {
    localStorage.removeItem(STORAGE_KEY)
    state.points = clonePoints(AUTOSAVE_MAP_TRACK_LOCAL_POINTS)
    state.selected = 0
    state.addMode = false
    clearStraightAnchors()
    updateHint()
    updateSelectedLabel()
    refresh()
  })
  host.appendChild(buttonRow)
  host.appendChild(output)
  document.body.appendChild(host)

  const setPointer = (ev: PointerEvent): void => {
    const rect = dom.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1)
  }

  const pointFromPointer = (ev: PointerEvent): THREE.Vector3 | null => {
    setPointer(ev)
    raycaster.setFromCamera(pointer, bundle.camera)
    const hit = new THREE.Vector3()
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null
  }

  const nearestPointIndexFromPointer = (ev: PointerEvent): number | null => {
    const rect = dom.getBoundingClientRect()
    const projected = new THREE.Vector3()
    let bestIndex: number | null = null
    let bestDistance = Infinity

    for (let i = 0; i < state.points.length; i++) {
      const world = autoSaveMapTrackPoint(state.points[i][0], state.points[i][1])
      projected.copy(world).project(bundle.camera)
      const sx = (projected.x * 0.5 + 0.5) * rect.width + rect.left
      const sy = (-projected.y * 0.5 + 0.5) * rect.height + rect.top
      const distance = Math.hypot(sx - ev.clientX, sy - ev.clientY)
      const threshold = i === state.selected ? 44 : 30
      if (distance < threshold && distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }

    return bestIndex
  }

  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.button === 1 || ev.button === 2) {
      panning = true
      lastScreen = { x: ev.clientX, y: ev.clientY }
      dom.setPointerCapture(ev.pointerId)
      ev.preventDefault()
      return
    }
    if (ev.button !== 0) return

    const nearestIndex = nearestPointIndexFromPointer(ev)
    if (nearestIndex === null) {
      if (straightSelectMode) return
      if (!state.addMode) return
      const hit = pointFromPointer(ev)
      if (!hit) return
      state.points.push(autoSaveMapWorldToLocal(hit))
      state.selected = state.points.length - 1
      updateSelectedLabel()
      refresh()
      ev.preventDefault()
      return
    }
    if (straightSelectMode) {
      selectStraightAnchor(nearestIndex)
      ev.preventDefault()
      return
    }
    state.selected = nearestIndex
    draggingIndex = nearestIndex
    dom.setPointerCapture(ev.pointerId)
    updateSelectedLabel()
    refresh()
    ev.preventDefault()
  }

  const onPointerMove = (ev: PointerEvent): void => {
    if (panning && lastScreen) {
      const dx = ev.clientX - lastScreen.x
      const dy = ev.clientY - lastScreen.y
      lastScreen = { x: ev.clientX, y: ev.clientY }
      panCamera(dx, dy)
      ev.preventDefault()
      return
    }

    if (draggingIndex === null) return
    const hit = pointFromPointer(ev)
    if (!hit) return
    state.points[draggingIndex] = autoSaveMapWorldToLocal(hit)
    updateSelectedLabel()
    refresh()
    ev.preventDefault()
  }

  const onPointerUp = (ev: PointerEvent): void => {
    draggingIndex = null
    panning = false
    lastScreen = null
    try {
      dom.releasePointerCapture(ev.pointerId)
    } catch {
      /* noop */
    }
  }

  const onWheel = (ev: WheelEvent): void => {
    zoomCamera(Math.exp(ev.deltaY * 0.001))
    ev.preventDefault()
  }

  const onContextMenu = (ev: MouseEvent): void => ev.preventDefault()

  const onKey = (ev: KeyboardEvent): void => {
    const p = state.points[state.selected]
    if (!p) return
    const step = ev.shiftKey ? 1 : 8
    if (ev.key === 'Tab') {
      state.selected = (state.selected + (ev.shiftKey ? state.points.length - 1 : 1)) % state.points.length
    } else if (ev.key === 'ArrowLeft') p[1] -= step
    else if (ev.key === 'ArrowRight') p[1] += step
    else if (ev.key === 'ArrowUp') p[0] += step
    else if (ev.key === 'ArrowDown') p[0] -= step
    else return
    ev.preventDefault()
    updateSelectedLabel()
    refresh()
  }

  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointermove', onPointerMove)
  dom.addEventListener('pointerup', onPointerUp)
  dom.addEventListener('pointercancel', onPointerUp)
  dom.addEventListener('wheel', onWheel, { passive: false })
  dom.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('keydown', onKey)

  updateSelectedLabel()
  refresh(startFromLegacy)
  setCamera('top')
  referenceModel?.ready.then(({ box }) => {
    mapBox = box
    setModelAppearance()
    fencePoints = extractFenceReferencePoints(referenceModel.group)
    rebuildFenceCloud()
    if (runAutoDetectOnReady) {
      autoDetectFromMap()
    }
    if (state.points.length === 0) setCamera('top')
  }).catch(() => undefined)

  return () => {
    dom.removeEventListener('pointerdown', onPointerDown)
    dom.removeEventListener('pointermove', onPointerMove)
    dom.removeEventListener('pointerup', onPointerUp)
    dom.removeEventListener('pointercancel', onPointerUp)
    dom.removeEventListener('wheel', onWheel)
    dom.removeEventListener('contextmenu', onContextMenu)
    window.removeEventListener('keydown', onKey)
    host.remove()
    restorePanelButton.remove()
    if (preview) {
      bundle.scene.remove(preview)
      disposeObject(preview)
    }
    if (fenceCloud) {
      bundle.scene.remove(fenceCloud)
      disposeObject(fenceCloud)
    }
  }
}

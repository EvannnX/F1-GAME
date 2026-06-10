import * as THREE from 'three'
import type { SceneBundle } from '../render/scene'
import type { TrackBundle } from '../render/track'

interface Point2 {
  x: number
  z: number
}

interface PointEditState {
  points: Point2[]
  sampleCount: number
  outputCount: number
  smoothPasses: number
  influence: number
  cameraHeight: number
  viewX: number
  viewZ: number
  showOriginalTrack: boolean
  showPoints: boolean
  hideGeneratedTrack: boolean
}

const STORAGE_KEY = 'f1s_track_point_editor'
const DEFAULT_STATE: PointEditState = {
  points: [],
  sampleCount: 240,
  outputCount: 240,
  smoothPasses: 1,
  influence: 6,
  cameraHeight: 1120,
  viewX: 0,
  viewZ: 0,
  showOriginalTrack: true,
  showPoints: true,
  hideGeneratedTrack: true,
}

export function isTrackPointEditGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('trackPointGui') || params.has('editTrack') || params.has('pointTrack')
}

function clonePoint(p: Point2): Point2 {
  return { x: p.x, z: p.z }
}

function clonePoints(points: Point2[]): Point2[] {
  return points.map(clonePoint)
}

function isPointArray(value: unknown): value is Point2[] {
  return Array.isArray(value) && value.every((p) =>
    p &&
    typeof p === 'object' &&
    Number.isFinite((p as Point2).x) &&
    Number.isFinite((p as Point2).z),
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function fmt(value: number, digits = 1): number {
  return Number(value.toFixed(digits))
}

function readSaved(): PointEditState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE, points: [] }
    const parsed = JSON.parse(raw) as Partial<PointEditState>
    return {
      points: isPointArray(parsed.points) ? parsed.points.map(clonePoint) : [],
      sampleCount: clamp(Math.round(parsed.sampleCount ?? DEFAULT_STATE.sampleCount), 48, 420),
      outputCount: clamp(Math.round(parsed.outputCount ?? DEFAULT_STATE.outputCount), 48, 420),
      smoothPasses: clamp(Math.round(parsed.smoothPasses ?? DEFAULT_STATE.smoothPasses), 0, 8),
      influence: clamp(Math.round(parsed.influence ?? DEFAULT_STATE.influence), 0, 32),
      cameraHeight: clamp(Number(parsed.cameraHeight ?? DEFAULT_STATE.cameraHeight), 240, 1800),
      viewX: Number.isFinite(parsed.viewX) ? Number(parsed.viewX) : DEFAULT_STATE.viewX,
      viewZ: Number.isFinite(parsed.viewZ) ? Number(parsed.viewZ) : DEFAULT_STATE.viewZ,
      showOriginalTrack: parsed.showOriginalTrack ?? DEFAULT_STATE.showOriginalTrack,
      showPoints: parsed.showPoints ?? DEFAULT_STATE.showPoints,
      hideGeneratedTrack: parsed.hideGeneratedTrack ?? DEFAULT_STATE.hideGeneratedTrack,
    }
  } catch {
    return { ...DEFAULT_STATE, points: [] }
  }
}

function writeSaved(state: PointEditState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

function sampleTrack(track: TrackBundle, count: number): Point2[] {
  const points: Point2[] = []
  for (let i = 0; i < count; i++) {
    const p = track.getPositionAt(i / count)
    points.push({ x: p.x, z: p.z })
  }
  return points
}

function distanceSq(a: Point2, b: Point2): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}

function smoothClosedOnce(points: Point2[]): Point2[] {
  const n = points.length
  if (n < 3) return clonePoints(points)
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    return {
      x: prev.x * 0.18 + p.x * 0.64 + next.x * 0.18,
      z: prev.z * 0.18 + p.z * 0.64 + next.z * 0.18,
    }
  })
}

function smoothClosed(points: Point2[], passes: number): Point2[] {
  let result = clonePoints(points)
  for (let i = 0; i < passes; i++) result = smoothClosedOnce(result)
  return result
}

function resampleClosed(points: Point2[], count: number): Point2[] {
  if (points.length < 3) return clonePoints(points)
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p.x, 0, p.z)),
    true,
    'centripetal',
  )
  const samples: Point2[] = []
  for (let i = 0; i < count; i++) {
    const p = curve.getPointAt(i / count)
    samples.push({ x: p.x, z: p.z })
  }
  return samples
}

function rotateToNearest(points: Point2[], target: Point2): Point2[] {
  if (points.length === 0) return []
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = distanceSq(points[i], target)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return points.slice(best).concat(points.slice(0, best))
}

function orientLikeTrack(points: Point2[], track: TrackBundle): Point2[] {
  if (points.length < 3) return clonePoints(points)
  const start = track.getPositionAt(0)
  const target = { x: start.x, z: start.z }
  const trackTangent = track.getTangentAt(0).normalize()
  const forward = rotateToNearest(points, target)
  const dx = forward[1].x - forward[0].x
  const dz = forward[1].z - forward[0].z
  const len = Math.hypot(dx, dz) || 1
  const dot = (dx / len) * trackTangent.x + (dz / len) * trackTangent.z
  if (dot >= 0) return forward
  return rotateToNearest(points.slice().reverse(), target)
}

function makeRibbon(
  points: Point2[],
  width: number,
  color: string,
  opacity: number,
  y: number,
  name: string,
): THREE.Mesh | null {
  if (points.length < 2) return null
  const n = points.length
  const half = width / 2
  const positions: number[] = []
  const indices: number[] = []

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    let tx = next.x - prev.x
    let tz = next.z - prev.z
    const len = Math.hypot(tx, tz) || 1
    tx /= len
    tz /= len
    const lx = -tz
    const lz = tx
    const p = points[i]
    positions.push(p.x + lx * half, y, p.z + lz * half)
    positions.push(p.x - lx * half, y, p.z - lz * half)
  }

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const a = i * 2
    const b = a + 1
    const c = j * 2
    const d = c + 1
    indices.push(a, b, c, b, d, c)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = name
  mesh.renderOrder = 1000
  return mesh
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

function outputPoints(state: PointEditState, track: TrackBundle): Point2[] {
  if (state.points.length < 3) return []
  const smoothed = smoothClosed(state.points, state.smoothPasses)
  return orientLikeTrack(resampleClosed(smoothed, state.outputCount), track)
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

function pointsSnippet(points: Point2[]): string {
  if (points.length < 3) return '// 还没有可输出的赛道点。'
  const lines = [
    '// Replace RAW_POINTS with this generated centerline.',
    'const RAW_POINTS: [number, number, number][] = [',
  ]
  for (const p of points) lines.push(`  [${fmt(p.x, 1)}, 0, ${fmt(p.z, 1)}],`)
  lines.push(']')
  return lines.join('\n')
}

export function installTrackPointEditGui(
  bundle: SceneBundle,
  track: TrackBundle,
): () => void {
  const state = readSaved()
  if (state.points.length < 3) state.points = sampleTrack(track, state.sampleCount)

  const editorGroup = new THREE.Group()
  editorGroup.name = 'track-point-editor'
  bundle.scene.add(editorGroup)

  const overlays = new THREE.Group()
  const markerGroup = new THREE.Group()
  editorGroup.add(overlays, markerGroup)

  const previousCameraUp = bundle.camera.up.clone()
  const viewCenter = new THREE.Vector3(state.viewX, 0, state.viewZ)
  const history: Point2[][] = []

  const markerGeo = new THREE.CircleGeometry(4.5, 18)
  const markerMat = new THREE.MeshBasicMaterial({
    color: '#22d3ee',
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const selectedMarkerMat = new THREE.MeshBasicMaterial({
    color: '#facc15',
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const straightAnchorMarkerMat = new THREE.MeshBasicMaterial({
    color: '#fb7185',
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const originalTrackPoints = sampleTrack(track, 280)

  const originalVisibility = new Map<THREE.Object3D, boolean>()
  const isEnvironmentGroundNode = (obj: THREE.Object3D): boolean => {
    let node: THREE.Object3D | null = obj
    while (node && node !== track.group) {
      if (node.name === 'environment-ground') return true
      node = node.parent
    }
    return false
  }
  const applyGeneratedTrackVisibility = (): void => {
    track.group.traverse((obj) => {
      if (obj === track.group || isEnvironmentGroundNode(obj)) return
      if (!originalVisibility.has(obj)) originalVisibility.set(obj, obj.visible)
      obj.visible = state.hideGeneratedTrack ? false : originalVisibility.get(obj) ?? true
    })
  }
  const restoreGeneratedTrackVisibility = (): void => {
    for (const [obj, visible] of originalVisibility) obj.visible = visible
  }
  const visibilityTimer = window.setInterval(applyGeneratedTrackVisibility, 500)

  const setTopCamera = (): void => {
    const cam = bundle.camera
    cam.up.set(0, 0, -1)
    cam.fov = 42
    cam.position.set(viewCenter.x, state.cameraHeight, viewCenter.z)
    cam.lookAt(viewCenter.x, 0, viewCenter.z)
    cam.updateProjectionMatrix()
  }

  const host = document.createElement('div')
  host.style.cssText = `
    position: fixed; right: 16px; top: 16px; z-index: 230;
    width: min(396px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    overflow: auto; padding: 14px;
    background: rgba(8,12,20,0.92); color: #fff;
    border: 1px solid rgba(255,255,255,0.16); border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    box-shadow: 0 16px 40px rgba(0,0,0,0.38);
  `

  const title = document.createElement('div')
  title.textContent = '赛道点微调'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px;'
  host.appendChild(title)

  const hint = document.createElement('div')
  hint.textContent = '当前赛道已采样成很多点。拖动蓝色点微调；影响范围越大，周围点会越柔和地跟随。滚轮缩放，右键拖动画面。'
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  host.appendChild(hint)

  const status = document.createElement('div')
  status.style.cssText = 'font-size:12px;color:#dbeafe;margin:8px 0;line-height:1.5;'
  host.appendChild(status)

  type NumberKey = 'cameraHeight' | 'influence' | 'smoothPasses' | 'sampleCount' | 'outputCount'
  const numberControls: Array<{ key: NumberKey; range: HTMLInputElement; number: HTMLInputElement }> = []
  const addSlider = (
    key: NumberKey,
    label: string,
    min: number,
    max: number,
    step: number,
  ): void => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:82px 1fr 74px;gap:8px;align-items:center;margin:8px 0;'

    const text = document.createElement('span')
    text.textContent = label
    text.style.cssText = 'font-size:12px;color:#ccd;'

    const range = document.createElement('input')
    range.type = 'range'
    range.min = String(min)
    range.max = String(max)
    range.step = String(step)

    const number = document.createElement('input')
    number.type = 'number'
    number.min = String(min)
    number.max = String(max)
    number.step = String(step)
    number.style.cssText = 'width:72px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px;'

    const onInput = (raw: string): void => {
      const value = Number(raw)
      if (!Number.isFinite(value)) return
      if (key === 'cameraHeight') {
        state.cameraHeight = clamp(value, min, max)
        setTopCamera()
      } else {
        state[key] = Math.round(clamp(value, min, max))
      }
      refresh()
    }
    range.addEventListener('input', () => onInput(range.value))
    number.addEventListener('input', () => onInput(number.value))

    numberControls.push({ key, range, number })
    row.append(text, range, number)
    host.appendChild(row)
  }

  addSlider('cameraHeight', '相机高度', 240, 1800, 10)
  addSlider('influence', '影响范围', 0, 32, 1)
  addSlider('smoothPasses', '输出平滑', 0, 8, 1)
  addSlider('sampleCount', '重建点数', 48, 420, 1)
  addSlider('outputCount', '输出点数', 48, 420, 1)

  const checkboxRow = document.createElement('div')
  checkboxRow.style.cssText = 'display:grid;gap:7px;margin:10px 0;'
  const addCheckbox = (
    label: string,
    get: () => boolean,
    set: (value: boolean) => void,
  ): HTMLInputElement => {
    const row = document.createElement('label')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;color:#ccd;font-size:12px;'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = get()
    input.addEventListener('change', () => {
      set(input.checked)
      refresh()
    })
    const text = document.createElement('span')
    text.textContent = label
    row.append(input, text)
    checkboxRow.appendChild(row)
    return input
  }
  const hideGeneratedInput = addCheckbox('隐藏当前 3D 赛道', () => state.hideGeneratedTrack, (value) => {
    state.hideGeneratedTrack = value
    applyGeneratedTrackVisibility()
  })
  const showOriginalInput = addCheckbox('显示原始中心线', () => state.showOriginalTrack, (value) => {
    state.showOriginalTrack = value
  })
  const showPointsInput = addCheckbox('显示拖动点', () => state.showPoints, (value) => {
    state.showPoints = value
  })
  host.appendChild(checkboxRow)

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;'
  const addButton = (text: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.cssText = primary
      ? 'border:1px solid #22d3ee;background:#0e7490;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;font-weight:800;'
      : 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;'
    btn.addEventListener('click', onClick)
    buttonRow.appendChild(btn)
    return btn
  }

  const pushHistory = (): void => {
    history.push(clonePoints(state.points))
    if (history.length > 40) history.shift()
  }

  let straightSelectMode = false
  let straightAnchorIndices: number[] = []
  let straightModeButton: HTMLButtonElement

  const setStraightSelectMode = (enabled: boolean): void => {
    straightSelectMode = enabled
    if (straightModeButton) {
      straightModeButton.style.background = enabled ? '#be123c' : '#111827'
      straightModeButton.style.borderColor = enabled ? 'rgba(255,255,255,0.5)' : '#475569'
      straightModeButton.textContent = enabled ? '正在选择端点' : '选择拉直端点'
    }
  }

  const selectStraightAnchor = (index: number): void => {
    selectedIndex = index
    const existing = straightAnchorIndices.indexOf(index)
    if (existing >= 0) {
      straightAnchorIndices.splice(existing, 1)
    } else {
      if (straightAnchorIndices.length >= 2) straightAnchorIndices = [straightAnchorIndices[1]]
      straightAnchorIndices.push(index)
    }
    refresh()
  }

  const straightenSelectedSegment = (): void => {
    if (straightAnchorIndices.length !== 2 || state.points.length < 3) return
    const indices = shortestSegmentIndices(straightAnchorIndices[0], straightAnchorIndices[1], state.points.length)
    if (indices.length < 3) return
    pushHistory()
    const start = clonePoint(state.points[indices[0]])
    const end = clonePoint(state.points[indices[indices.length - 1]])
    const total = indices.length - 1
    for (let i = 1; i < indices.length - 1; i++) {
      const t = i / total
      state.points[indices[i]] = {
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      }
    }
    selectedIndex = null
    setStraightSelectMode(false)
    refresh()
  }

  addButton('撤销', () => {
    const prev = history.pop()
    if (!prev) return
    state.points = prev
    straightAnchorIndices = straightAnchorIndices.filter((index) => index < state.points.length)
    refresh()
  })
  addButton('从当前赛道重建点', () => {
    pushHistory()
    state.points = sampleTrack(track, state.sampleCount)
    state.outputCount = state.sampleCount
    straightAnchorIndices = []
    refresh()
  })
  addButton('应用平滑到点', () => {
    pushHistory()
    state.points = smoothClosed(state.points, 1)
    refresh()
  })
  straightModeButton = addButton('选择拉直端点', () => {
    setStraightSelectMode(!straightSelectMode)
    refresh()
  })
  addButton('拉直选中段', straightenSelectedSegment)
  addButton('清除端点', () => {
    straightAnchorIndices = []
    setStraightSelectMode(false)
    refresh()
  })
  addButton('复制 RAW_POINTS', () => void navigator.clipboard?.writeText(output.textContent ?? ''), true)
  addButton('清除本机保存', () => {
    localStorage.removeItem(STORAGE_KEY)
    history.length = 0
    state.points = sampleTrack(track, DEFAULT_STATE.sampleCount)
    state.sampleCount = DEFAULT_STATE.sampleCount
    state.outputCount = DEFAULT_STATE.outputCount
    state.smoothPasses = DEFAULT_STATE.smoothPasses
    state.influence = DEFAULT_STATE.influence
    selectedIndex = null
    straightAnchorIndices = []
    setStraightSelectMode(false)
    refresh()
  })
  host.appendChild(buttonRow)

  const output = document.createElement('pre')
  output.style.cssText = `
    margin: 10px 0 0; padding: 10px; border-radius: 6px;
    background: rgba(255,255,255,0.08); color: #dff;
    font-size: 10.5px; line-height: 1.4; max-height: 240px;
    overflow: auto; white-space: pre; user-select: text;
  `
  host.appendChild(output)
  document.body.appendChild(host)

  const worldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const pointer = new THREE.Vector2()
  const raycaster = new THREE.Raycaster()
  const dom = bundle.renderer.domElement
  const eventToWorld = (ev: PointerEvent | WheelEvent): Point2 | null => {
    const rect = dom.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1)
    raycaster.setFromCamera(pointer, bundle.camera)
    const hit = new THREE.Vector3()
    return raycaster.ray.intersectPlane(worldPlane, hit) ? { x: hit.x, z: hit.z } : null
  }

  const nearestPointIndex = (ev: PointerEvent): number | null => {
    const rect = dom.getBoundingClientRect()
    const projected = new THREE.Vector3()
    let best: number | null = null
    let bestD = 18
    for (let i = 0; i < state.points.length; i++) {
      projected.set(state.points[i].x, 0, state.points[i].z).project(bundle.camera)
      const sx = (projected.x * 0.5 + 0.5) * rect.width + rect.left
      const sy = (-projected.y * 0.5 + 0.5) * rect.height + rect.top
      const d = Math.hypot(sx - ev.clientX, sy - ev.clientY)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  let selectedIndex: number | null = null
  let draggingIndex: number | null = null
  let lastWorld: Point2 | null = null
  let panning = false
  let lastScreen: { x: number; y: number } | null = null

  const movePointCluster = (index: number, dx: number, dz: number): void => {
    const n = state.points.length
    const radius = state.influence
    for (let offset = -radius; offset <= radius; offset++) {
      const wrapped = (index + offset + n) % n
      const t = radius === 0 ? 1 : Math.abs(offset) / (radius + 1)
      const weight = radius === 0 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * t)
      state.points[wrapped].x += dx * weight
      state.points[wrapped].z += dz * weight
    }
  }

  const clearOverlays = (): void => {
    while (overlays.children.length > 0) {
      const child = overlays.children[0]
      overlays.remove(child)
      disposeObject(child)
    }
    markerGroup.clear()
  }

  function refresh(): void {
    state.viewX = viewCenter.x
    state.viewZ = viewCenter.z
    writeSaved(state)
    applyGeneratedTrackVisibility()

    for (const control of numberControls) {
      const value = String(state[control.key])
      control.range.value = value
      control.number.value = value
    }
    hideGeneratedInput.checked = state.hideGeneratedTrack
    showOriginalInput.checked = state.showOriginalTrack
    showPointsInput.checked = state.showPoints
    setStraightSelectMode(straightSelectMode)

    const previewPoints = smoothClosed(state.points, state.smoothPasses)
    const finalPoints = outputPoints(state, track)

    clearOverlays()
    if (state.showOriginalTrack) {
      const original = makeRibbon(originalTrackPoints, 3, '#ffffff', 0.45, 1.5, 'original-track-line')
      if (original) overlays.add(original)
    }
    const edited = makeRibbon(previewPoints, 8, '#facc15', 0.88, 2.6, 'edited-track-line')
    if (edited) overlays.add(edited)

    if (state.showPoints) {
      for (let i = 0; i < state.points.length; i++) {
        const p = state.points[i]
        const markerMaterial = straightAnchorIndices.includes(i)
          ? straightAnchorMarkerMat
          : i === selectedIndex
            ? selectedMarkerMat
            : markerMat
        const marker = new THREE.Mesh(markerGeo, markerMaterial)
        marker.position.set(p.x, 3.2, p.z)
        marker.rotation.x = -Math.PI / 2
        marker.renderOrder = 1010
        markerGroup.add(marker)
      }
    }

    const anchorText = straightAnchorIndices.length === 0
      ? '未选端点'
      : `端点 ${straightAnchorIndices.map((index) => index + 1).join(' / ')}`
    status.textContent = `可拖动点 ${state.points.length} 个 / 输出 ${finalPoints.length} 个 / 平滑 ${state.smoothPasses} / 影响范围 ${state.influence} / ${anchorText}`
    output.textContent = pointsSnippet(finalPoints)
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

    const nearest = nearestPointIndex(ev)
    const world = eventToWorld(ev)
    if (nearest === null) return
    if (straightSelectMode) {
      selectStraightAnchor(nearest)
      ev.preventDefault()
      return
    }
    if (!world) return
    pushHistory()
    selectedIndex = nearest
    draggingIndex = nearest
    lastWorld = world
    dom.setPointerCapture(ev.pointerId)
    ev.preventDefault()
    refresh()
  }

  const onPointerMove = (ev: PointerEvent): void => {
    if (panning && lastScreen) {
      const dx = ev.clientX - lastScreen.x
      const dy = ev.clientY - lastScreen.y
      lastScreen = { x: ev.clientX, y: ev.clientY }
      const rect = dom.getBoundingClientRect()
      const worldPerPixel =
        (2 * state.cameraHeight * Math.tan(THREE.MathUtils.degToRad(bundle.camera.fov / 2))) /
        Math.max(1, rect.height)
      viewCenter.x -= dx * worldPerPixel
      viewCenter.z -= dy * worldPerPixel
      setTopCamera()
      refresh()
      ev.preventDefault()
      return
    }

    if (draggingIndex === null || !lastWorld) return
    const world = eventToWorld(ev)
    if (!world) return
    const dx = world.x - lastWorld.x
    const dz = world.z - lastWorld.z
    lastWorld = world
    movePointCluster(draggingIndex, dx, dz)
    refresh()
    ev.preventDefault()
  }

  const onPointerUp = (ev: PointerEvent): void => {
    draggingIndex = null
    lastWorld = null
    panning = false
    lastScreen = null
    try {
      dom.releasePointerCapture(ev.pointerId)
    } catch {
      /* noop */
    }
  }

  const onWheel = (ev: WheelEvent): void => {
    state.cameraHeight = clamp(state.cameraHeight * Math.exp(ev.deltaY * 0.001), 240, 1800)
    setTopCamera()
    refresh()
    ev.preventDefault()
  }

  const onContextMenu = (ev: MouseEvent): void => ev.preventDefault()

  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointermove', onPointerMove)
  dom.addEventListener('pointerup', onPointerUp)
  dom.addEventListener('pointercancel', onPointerUp)
  dom.addEventListener('wheel', onWheel, { passive: false })
  dom.addEventListener('contextmenu', onContextMenu)

  setTopCamera()
  refresh()

  return () => {
    window.clearInterval(visibilityTimer)
    dom.removeEventListener('pointerdown', onPointerDown)
    dom.removeEventListener('pointermove', onPointerMove)
    dom.removeEventListener('pointerup', onPointerUp)
    dom.removeEventListener('pointercancel', onPointerUp)
    dom.removeEventListener('wheel', onWheel)
    dom.removeEventListener('contextmenu', onContextMenu)
    bundle.camera.up.copy(previousCameraUp)
    restoreGeneratedTrackVisibility()
    host.remove()
    bundle.scene.remove(editorGroup)
    disposeObject(editorGroup)
    markerGeo.dispose()
    markerMat.dispose()
    selectedMarkerMat.dispose()
    straightAnchorMarkerMat.dispose()
  }
}

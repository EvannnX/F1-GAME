import * as THREE from 'three'
import type { SceneBundle } from '../render/scene'
import type { TrackBundle } from '../render/track'

type Side = 'left' | 'right'

interface Point2 {
  x: number
  z: number
}

interface TraceState {
  left: Point2[]
  right: Point2[]
  outputCount: number
  smoothPasses: number
  drawSpacing: number
  cameraHeight: number
  viewX: number
  viewZ: number
  showCurrentTrack: boolean
  showPoints: boolean
  hideGeneratedTrack: boolean
}

interface DerivedTrace {
  leftSmooth: Point2[]
  rightSmooth: Point2[]
  centerSmooth: Point2[]
  outputPoints: Point2[]
  averageHalfWidth: number | null
}

const STORAGE_KEY = 'f1s_track_outline_trace'
const SMOOTH_SAMPLE_COUNT = 260

const DEFAULT_STATE: TraceState = {
  left: [],
  right: [],
  outputCount: 80,
  smoothPasses: 3,
  drawSpacing: 8,
  cameraHeight: 1120,
  viewX: 0,
  viewZ: 0,
  showCurrentTrack: true,
  showPoints: true,
  hideGeneratedTrack: true,
}

export function isTrackTraceGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('trackTraceGui') || params.has('traceTrack') || params.has('outlineTrack')
}

function clonePoint(p: Point2): Point2 {
  return { x: p.x, z: p.z }
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

function readSaved(): TraceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE, left: [], right: [] }
    const parsed = JSON.parse(raw) as Partial<TraceState>
    return {
      left: isPointArray(parsed.left) ? parsed.left.map(clonePoint) : [],
      right: isPointArray(parsed.right) ? parsed.right.map(clonePoint) : [],
      outputCount: clamp(Math.round(parsed.outputCount ?? DEFAULT_STATE.outputCount), 24, 180),
      smoothPasses: clamp(Math.round(parsed.smoothPasses ?? DEFAULT_STATE.smoothPasses), 0, 8),
      drawSpacing: clamp(Number(parsed.drawSpacing ?? DEFAULT_STATE.drawSpacing), 2, 40),
      cameraHeight: clamp(Number(parsed.cameraHeight ?? DEFAULT_STATE.cameraHeight), 260, 1800),
      viewX: Number.isFinite(parsed.viewX) ? Number(parsed.viewX) : DEFAULT_STATE.viewX,
      viewZ: Number.isFinite(parsed.viewZ) ? Number(parsed.viewZ) : DEFAULT_STATE.viewZ,
      showCurrentTrack: parsed.showCurrentTrack ?? DEFAULT_STATE.showCurrentTrack,
      showPoints: parsed.showPoints ?? DEFAULT_STATE.showPoints,
      hideGeneratedTrack: parsed.hideGeneratedTrack ?? DEFAULT_STATE.hideGeneratedTrack,
    }
  } catch {
    return { ...DEFAULT_STATE, left: [], right: [] }
  }
}

function writeSaved(state: TraceState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* noop */
  }
}

function distanceSq(a: Point2, b: Point2): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz
}

function distance(a: Point2, b: Point2): number {
  return Math.sqrt(distanceSq(a, b))
}

function fmt(value: number, digits = 1): number {
  return Number(value.toFixed(digits))
}

function smoothClosedOnce(points: Point2[]): Point2[] {
  const n = points.length
  if (n < 3) return points.map(clonePoint)
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]
    return {
      x: prev.x * 0.2 + p.x * 0.6 + next.x * 0.2,
      z: prev.z * 0.2 + p.z * 0.6 + next.z * 0.2,
    }
  })
}

function sampleSmooth(points: Point2[], count: number, smoothPasses: number): Point2[] {
  if (points.length === 0) return []
  if (points.length === 1) return [clonePoint(points[0])]
  if (points.length === 2) return points.map(clonePoint)

  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p.x, 0, p.z)),
    true,
    'centripetal',
  )
  let samples: Point2[] = []
  for (let i = 0; i < count; i++) {
    const p = curve.getPointAt(i / count)
    samples.push({ x: p.x, z: p.z })
  }
  for (let pass = 0; pass < smoothPasses; pass++) {
    samples = smoothClosedOnce(samples)
  }
  return samples
}

function alignClosedSides(left: Point2[], right: Point2[]): { right: Point2[]; averageWidth: number } {
  const n = Math.min(left.length, right.length)
  if (n === 0) return { right: [], averageWidth: 0 }
  const leftSamples = left.slice(0, n)
  const candidates = [right.slice(0, n), right.slice(0, n).reverse()]
  let bestOffset = 0
  let bestCandidate = candidates[0]
  let bestScore = Infinity
  const step = Math.max(1, Math.floor(n / 90))

  for (const candidate of candidates) {
    for (let offset = 0; offset < n; offset++) {
      let score = 0
      let samples = 0
      for (let i = 0; i < n; i += step) {
        score += distanceSq(leftSamples[i], candidate[(i + offset) % n])
        samples++
      }
      score /= Math.max(1, samples)
      if (score < bestScore) {
        bestScore = score
        bestOffset = offset
        bestCandidate = candidate
      }
    }
  }

  const aligned = leftSamples.map((_, i) => bestCandidate[(i + bestOffset) % n])
  const averageWidth = aligned.reduce((sum, p, i) => sum + distance(leftSamples[i], p), 0) / n
  return { right: aligned, averageWidth }
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
  if (points.length < 3) return points.map(clonePoint)
  const start = track.getPositionAt(0)
  const target = { x: start.x, z: start.z }
  const currentTangent = track.getTangentAt(0).normalize()
  const forward = rotateToNearest(points, target)
  const dx = forward[1].x - forward[0].x
  const dz = forward[1].z - forward[0].z
  const len = Math.hypot(dx, dz) || 1
  const dot = (dx / len) * currentTangent.x + (dz / len) * currentTangent.z
  if (dot >= 0) return forward
  return rotateToNearest(points.slice().reverse(), target)
}

function resampleClosed(points: Point2[], count: number): Point2[] {
  if (points.length < 3) return points.map(clonePoint)
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

function snippetFrom(points: Point2[], averageHalfWidth: number | null): string {
  if (points.length < 3) return '// 先描完左、右两侧，每侧至少 3 个点。'
  const lines = [
    `// Estimated ROAD_HALF_WIDTH: ${averageHalfWidth === null ? 'unknown' : fmt(averageHalfWidth, 2)}`,
    'const RAW_POINTS: [number, number, number][] = [',
  ]
  for (const p of points) {
    lines.push(`  [${fmt(p.x, 1)}, 0, ${fmt(p.z, 1)}],`)
  }
  lines.push(']')
  return lines.join('\n')
}

export function installTrackTraceGui(
  bundle: SceneBundle,
  track: TrackBundle,
): () => void {
  const state = readSaved()
  let activeSide: Side = 'left'
  const viewCenter = new THREE.Vector3(state.viewX, 0, state.viewZ)
  const previousCameraUp = bundle.camera.up.clone()
  const editorGroup = new THREE.Group()
  editorGroup.name = 'track-trace-editor'
  bundle.scene.add(editorGroup)

  const overlays = new THREE.Group()
  const markerGroup = new THREE.Group()
  editorGroup.add(overlays, markerGroup)

  const markerGeo = new THREE.CircleGeometry(6, 20)
  const leftMarkerMat = new THREE.MeshBasicMaterial({
    color: '#19d3ff',
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const rightMarkerMat = new THREE.MeshBasicMaterial({
    color: '#ff3b6b',
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

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

  const computeDerived = (): DerivedTrace => {
    const leftSmooth = sampleSmooth(state.left, SMOOTH_SAMPLE_COUNT, state.smoothPasses)
    const rightSmooth = sampleSmooth(state.right, SMOOTH_SAMPLE_COUNT, state.smoothPasses)
    if (leftSmooth.length < 3 || rightSmooth.length < 3) {
      return {
        leftSmooth,
        rightSmooth,
        centerSmooth: [],
        outputPoints: [],
        averageHalfWidth: null,
      }
    }
    const aligned = alignClosedSides(leftSmooth, rightSmooth)
    const centerSmooth = leftSmooth.map((p, i) => ({
      x: (p.x + aligned.right[i].x) / 2,
      z: (p.z + aligned.right[i].z) / 2,
    }))
    const outputPoints = orientLikeTrack(resampleClosed(centerSmooth, state.outputCount), track)
    return {
      leftSmooth,
      rightSmooth: aligned.right,
      centerSmooth,
      outputPoints,
      averageHalfWidth: aligned.averageWidth / 2,
    }
  }

  const host = document.createElement('div')
  host.style.cssText = `
    position: fixed; right: 16px; top: 16px; z-index: 220;
    width: min(390px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    overflow: auto; padding: 14px;
    background: rgba(8,12,20,0.92); color: #fff;
    border: 1px solid rgba(255,255,255,0.16); border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    box-shadow: 0 16px 40px rgba(0,0,0,0.38);
  `

  const title = document.createElement('div')
  title.textContent = '赛道两侧描边'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px;'
  host.appendChild(title)

  const hint = document.createElement('div')
  hint.textContent = '选择一侧后，在贴图上点击或拖动描边；两侧都画完后会自动平滑并生成黄色中心线。滚轮缩放，右键拖动平移。'
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  host.appendChild(hint)

  const status = document.createElement('div')
  status.style.cssText = 'font-size:12px;color:#dbeafe;margin:8px 0;line-height:1.5;'
  host.appendChild(status)

  const sideRow = document.createElement('div')
  sideRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;'
  const sideButtons: Record<Side, HTMLButtonElement> = {
    left: document.createElement('button'),
    right: document.createElement('button'),
  }
  const setActiveSide = (side: Side): void => {
    activeSide = side
    for (const key of ['left', 'right'] as Side[]) {
      const btn = sideButtons[key]
      btn.style.background = activeSide === key ? (key === 'left' ? '#0891b2' : '#be123c') : '#111827'
      btn.style.borderColor = activeSide === key ? 'rgba(255,255,255,0.5)' : '#475569'
    }
  }
  sideButtons.left.textContent = '左边界'
  sideButtons.right.textContent = '右边界'
  for (const side of ['left', 'right'] as Side[]) {
    const btn = sideButtons[side]
    btn.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:8px 9px;cursor:pointer;font-weight:700;'
    btn.addEventListener('click', () => setActiveSide(side))
    sideRow.appendChild(btn)
  }
  host.appendChild(sideRow)

  type NumberKey = 'outputCount' | 'smoothPasses' | 'drawSpacing' | 'cameraHeight'
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
      if (key === 'outputCount' || key === 'smoothPasses') {
        state[key] = Math.round(clamp(value, min, max))
      } else {
        state[key] = clamp(value, min, max)
      }
      if (key === 'cameraHeight') setTopCamera()
      refresh()
    }
    range.addEventListener('input', () => onInput(range.value))
    number.addEventListener('input', () => onInput(number.value))

    numberControls.push({ key, range, number })
    row.append(text, range, number)
    host.appendChild(row)
  }
  addSlider('cameraHeight', '相机高度', 260, 1800, 10)
  addSlider('drawSpacing', '描点间距', 2, 40, 1)
  addSlider('smoothPasses', '平滑强度', 0, 8, 1)
  addSlider('outputCount', '输出点数', 24, 180, 1)

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
  const showCurrentInput = addCheckbox('显示旧中心线', () => state.showCurrentTrack, (value) => {
    state.showCurrentTrack = value
  })
  const showPointsInput = addCheckbox('显示描点', () => state.showPoints, (value) => {
    state.showPoints = value
  })
  host.appendChild(checkboxRow)

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;'
  const addButton = (text: string, onClick: () => void): void => {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;'
    btn.addEventListener('click', onClick)
    buttonRow.appendChild(btn)
  }
  addButton('撤销当前侧', () => {
    state[activeSide].pop()
    refresh()
  })
  addButton('清空当前侧', () => {
    state[activeSide] = []
    refresh()
  })
  addButton('全部清空', () => {
    state.left = []
    state.right = []
    refresh()
  })
  addButton('自动平滑', () => refresh())
  host.appendChild(buttonRow)

  const output = document.createElement('pre')
  output.style.cssText = `
    margin: 10px 0 0; padding: 10px; border-radius: 6px;
    background: rgba(255,255,255,0.08); color: #dff;
    font-size: 10.5px; line-height: 1.4; max-height: 240px;
    overflow: auto; white-space: pre; user-select: text;
  `

  const copyRow = document.createElement('div')
  copyRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;'
  const copyButton = document.createElement('button')
  copyButton.textContent = '复制 RAW_POINTS'
  copyButton.style.cssText = 'border:1px solid #22d3ee;background:#0e7490;color:#fff;border-radius:6px;padding:8px 10px;cursor:pointer;font-weight:800;'
  copyButton.addEventListener('click', () => void navigator.clipboard?.writeText(output.textContent ?? ''))
  copyRow.appendChild(copyButton)
  const clearSavedButton = document.createElement('button')
  clearSavedButton.textContent = '清除本机保存'
  clearSavedButton.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:8px 10px;cursor:pointer;'
  clearSavedButton.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY)
    state.left = []
    state.right = []
    refresh()
  })
  copyRow.appendChild(clearSavedButton)
  host.appendChild(copyRow)
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
    const result = raycaster.ray.intersectPlane(worldPlane, hit)
    return result ? { x: hit.x, z: hit.z } : null
  }

  const nearestPointIndex = (points: Point2[], ev: PointerEvent): number | null => {
    const rect = dom.getBoundingClientRect()
    let bestIndex: number | null = null
    let bestDistance = 18
    const projected = new THREE.Vector3()
    for (let i = 0; i < points.length; i++) {
      projected.set(points[i].x, 0, points[i].z).project(bundle.camera)
      const sx = (projected.x * 0.5 + 0.5) * rect.width + rect.left
      const sy = (-projected.y * 0.5 + 0.5) * rect.height + rect.top
      const d = Math.hypot(sx - ev.clientX, sy - ev.clientY)
      if (d < bestDistance) {
        bestDistance = d
        bestIndex = i
      }
    }
    return bestIndex
  }

  const currentTrackPoints: Point2[] = []
  for (let i = 0; i < 260; i++) {
    const p = track.getPositionAt(i / 260)
    currentTrackPoints.push({ x: p.x, z: p.z })
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
    showCurrentInput.checked = state.showCurrentTrack
    showPointsInput.checked = state.showPoints
    setActiveSide(activeSide)

    const derived = computeDerived()
    clearOverlays()

    if (state.showCurrentTrack) {
      const current = makeRibbon(currentTrackPoints, 3, '#ffffff', 0.48, 1.4, 'current-track-center')
      if (current) overlays.add(current)
    }
    const leftMesh = makeRibbon(derived.leftSmooth, 5, '#19d3ff', 0.85, 2.0, 'trace-left')
    const rightMesh = makeRibbon(derived.rightSmooth, 5, '#ff3b6b', 0.85, 2.2, 'trace-right')
    const centerMesh = makeRibbon(derived.centerSmooth, 7, '#facc15', 0.9, 2.6, 'trace-center')
    if (leftMesh) overlays.add(leftMesh)
    if (rightMesh) overlays.add(rightMesh)
    if (centerMesh) overlays.add(centerMesh)

    if (state.showPoints) {
      for (const side of ['left', 'right'] as Side[]) {
        const mat = side === 'left' ? leftMarkerMat : rightMarkerMat
        for (const p of state[side]) {
          const marker = new THREE.Mesh(markerGeo, mat)
          marker.position.set(p.x, 3.2, p.z)
          marker.rotation.x = -Math.PI / 2
          marker.renderOrder = 1010
          markerGroup.add(marker)
        }
      }
    }

    const halfWidthText = derived.averageHalfWidth === null ? '等待两侧完成' : `${fmt(derived.averageHalfWidth, 2)} m`
    status.textContent = `左侧 ${state.left.length} 点 / 右侧 ${state.right.length} 点 / 估算半宽 ${halfWidthText}`
    output.textContent = snippetFrom(derived.outputPoints, derived.averageHalfWidth)
  }

  let drawing = false
  let draggingIndex: number | null = null
  let panning = false
  let lastScreen: { x: number; y: number } | null = null

  const addPoint = (point: Point2): void => {
    const points = state[activeSide]
    const last = points[points.length - 1]
    if (last && distance(last, point) < state.drawSpacing) return
    points.push(point)
    refresh()
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

    const points = state[activeSide]
    const nearest = nearestPointIndex(points, ev)
    if (ev.altKey && nearest !== null) {
      points.splice(nearest, 1)
      refresh()
      ev.preventDefault()
      return
    }

    const world = eventToWorld(ev)
    if (!world) return
    dom.setPointerCapture(ev.pointerId)
    if (nearest !== null) {
      draggingIndex = nearest
      points[nearest] = world
      refresh()
    } else {
      drawing = true
      addPoint(world)
    }
    ev.preventDefault()
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

    const world = eventToWorld(ev)
    if (!world) return
    if (draggingIndex !== null) {
      state[activeSide][draggingIndex] = world
      refresh()
      ev.preventDefault()
      return
    }
    if (drawing) {
      addPoint(world)
      ev.preventDefault()
    }
  }

  const onPointerUp = (ev: PointerEvent): void => {
    drawing = false
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
    state.cameraHeight = clamp(state.cameraHeight * Math.exp(ev.deltaY * 0.001), 260, 1800)
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
  setActiveSide(activeSide)
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
    leftMarkerMat.dispose()
    rightMarkerMat.dispose()
  }
}

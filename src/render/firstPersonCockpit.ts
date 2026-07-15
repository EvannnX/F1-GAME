import * as THREE from 'three'

export interface FirstPersonCockpitBundle {
  group: THREE.Group
  ready: Promise<void>
  getCameraOffset: () => THREE.Vector3
  getDragTarget: () => CockpitDragTarget
  getEditorViewMode: () => CockpitEditorViewMode
  getModelOffset: () => THREE.Vector3
  getPlacementRevision: () => number
  getViewRotationOffset: () => THREE.Vector3
  setCameraOffset: (offset: THREE.Vector3) => void
  setViewRotationOffset: (offset: THREE.Vector3) => void
  setModelOffset: (offset: THREE.Vector3) => void
  update: (dt: number, speed01: number, steer?: number) => void
  dispose: () => void
}

export interface FirstPersonCockpitOptions {
  onSnapModelToGround?: () => void
}

export type CockpitEditorViewMode = 'first' | 'third'
export type CockpitDragTarget = 'model' | 'camera'

interface PivotRef {
  pivot: THREE.Group
  baseQuaternion: THREE.Quaternion
}

interface FirstPersonWheelRef {
  steerPivot: PivotRef
  spinPivot: PivotRef
  spinAxis: THREE.Vector3
  spin: number
}

interface SteeringRigRef {
  pivot: PivotRef
}

interface CandidatePart {
  obj: THREE.Object3D
  name: string
  center: THREE.Vector3
  size: THREE.Vector3
  score: number
}

interface CockpitPlacement {
  x: number
  y: number
  z: number
  yawDeg: number
  cameraX: number
  cameraY: number
  cameraZ: number
  forwardYawDeg: number
  viewPitchDeg: number
  viewYawDeg: number
  viewRollDeg: number
  scale: number
}

interface CockpitPlacementGuiController {
  dispose: () => void
  refresh: () => void
}

interface CockpitGuiField {
  id: string
  label: string
  section: string
  min: number
  max: number
  step: number
  get: () => number
  set: (next: number) => void
}

interface CockpitForwardFaceOption {
  label: string
  yawDeg: number
}

const COCKPIT_PLACEMENT_STORAGE_KEY = 'f1s_first_person_cockpit_placement_v8'
const LEGACY_COCKPIT_PLACEMENT_STORAGE_KEYS = [
  'f1s_first_person_cockpit_placement_v7',
  'f1s_first_person_cockpit_placement_v2',
  'f1s_first_person_cockpit_placement_v1',
]
const DEFAULT_COCKPIT_PLACEMENT: CockpitPlacement = {
  x: -0.31,
  y: -1.89,
  z: -1.58,
  yawDeg: 180,
  cameraX: 0,
  cameraY: 0.44,
  cameraZ: 0.08,
  forwardYawDeg: 0,
  viewPitchDeg: -1.1,
  viewYawDeg: -2,
  viewRollDeg: -1.4,
  scale: 2.35,
}
const COCKPIT_FORWARD_FACE_OPTIONS: CockpitForwardFaceOption[] = [
  { label: '当前面', yawDeg: 0 },
  { label: '右侧', yawDeg: 90 },
  { label: '背面', yawDeg: 180 },
  { label: '左侧', yawDeg: -90 },
]
const WHEEL_STEER_MAX_RAD = THREE.MathUtils.degToRad(18)
const STEERING_WHEEL_MAX_RAD = THREE.MathUtils.degToRad(42)
const WHEEL_SPIN_AXIS = new THREE.Vector3(0, 0, 1)
const STEERING_WHEEL_AXIS = new THREE.Vector3(0, 0, 1)
const FIRST_PERSON_WHEEL_GROUPS = [
  { name: 'left-front', parts: ['tripo_part_6', 'part6'] },
  { name: 'right-front', parts: ['tripo_part_2', 'part2'] },
]
const FIRST_PERSON_STEERING_WHEEL_PARTS = ['tripo_part_3', 'part3']
const FIRST_PERSON_LEFT_HAND_PARTS = ['tripo_part_5', 'part5', 'tripo_part_7', 'part7']
const FIRST_PERSON_RIGHT_HAND_PARTS = ['tripo_part_4', 'part4', 'tripo_part_10', 'part10']

function partKeyFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function buildPartLookup(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const lookup = new Map<string, THREE.Object3D>()
  root.traverse((obj) => {
    if (!obj.name) return
    const lower = obj.name.toLowerCase()
    const key = partKeyFromName(obj.name)
    if (!lookup.has(lower)) lookup.set(lower, obj)
    if (!lookup.has(key)) lookup.set(key, obj)
  })
  return lookup
}

function resolvePartRoot(obj: THREE.Object3D, aliases: string[]): THREE.Object3D {
  const aliasKeys = new Set(aliases.flatMap((alias) => [alias.toLowerCase(), partKeyFromName(alias)]))
  let current: THREE.Object3D | null = obj
  let root = obj
  while (current) {
    if (
      current.name &&
      (aliasKeys.has(current.name.toLowerCase()) || aliasKeys.has(partKeyFromName(current.name)))
    ) {
      root = current
    }
    current = current.parent
  }
  return root
}

function findParts(lookup: Map<string, THREE.Object3D>, names: string[]): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const found = lookup.get(name.toLowerCase()) ?? lookup.get(partKeyFromName(name))
    const part = found ? resolvePartRoot(found, names) : null
    if (!part || seen.has(part.uuid)) continue
    seen.add(part.uuid)
    parts.push(part)
  }
  return parts
}

function normalizeCockpitPlacement(value: Partial<CockpitPlacement>): CockpitPlacement | null {
  const merged = { ...DEFAULT_COCKPIT_PLACEMENT, ...value }
  if (
    !Number.isFinite(merged.x) ||
    !Number.isFinite(merged.y) ||
    !Number.isFinite(merged.z) ||
    !Number.isFinite(merged.yawDeg) ||
    !Number.isFinite(merged.cameraX) ||
    !Number.isFinite(merged.cameraY) ||
    !Number.isFinite(merged.cameraZ) ||
    !Number.isFinite(merged.forwardYawDeg) ||
    !Number.isFinite(merged.viewPitchDeg) ||
    !Number.isFinite(merged.viewYawDeg) ||
    !Number.isFinite(merged.viewRollDeg) ||
    !Number.isFinite(merged.scale)
  ) {
    return null
  }
  return {
    x: THREE.MathUtils.clamp(merged.x, -3, 3),
    y: THREE.MathUtils.clamp(merged.y, -4, 1),
    z: THREE.MathUtils.clamp(merged.z, -8, 1),
    yawDeg: THREE.MathUtils.clamp(merged.yawDeg, -360, 360),
    cameraX: THREE.MathUtils.clamp(merged.cameraX, -8, 8),
    cameraY: THREE.MathUtils.clamp(merged.cameraY, -2, 6),
    cameraZ: THREE.MathUtils.clamp(merged.cameraZ, -8, 12),
    forwardYawDeg: THREE.MathUtils.clamp(merged.forwardYawDeg, -180, 180),
    viewPitchDeg: THREE.MathUtils.clamp(merged.viewPitchDeg, -45, 45),
    viewYawDeg: THREE.MathUtils.clamp(merged.viewYawDeg, -90, 90),
    viewRollDeg: THREE.MathUtils.clamp(merged.viewRollDeg, -45, 45),
    scale: THREE.MathUtils.clamp(merged.scale, 0.2, 6),
  }
}

function readCockpitPlacement(): CockpitPlacement {
  try {
    const raw = window.localStorage.getItem(COCKPIT_PLACEMENT_STORAGE_KEY)
    if (raw) {
      return normalizeCockpitPlacement(JSON.parse(raw) as Partial<CockpitPlacement>) ?? { ...DEFAULT_COCKPIT_PLACEMENT }
    }
    for (const key of LEGACY_COCKPIT_PLACEMENT_STORAGE_KEYS) {
      const legacyRaw = window.localStorage.getItem(key)
      if (!legacyRaw) continue
      const migrated = normalizeCockpitPlacement(JSON.parse(legacyRaw) as Partial<CockpitPlacement>)
      if (!migrated) continue
      migrated.forwardYawDeg = DEFAULT_COCKPIT_PLACEMENT.forwardYawDeg
      writeCockpitPlacement(migrated)
      return migrated
    }
    return { ...DEFAULT_COCKPIT_PLACEMENT }
  } catch {
    return { ...DEFAULT_COCKPIT_PLACEMENT }
  }
}

function writeCockpitPlacement(value: CockpitPlacement): void {
  try {
    window.localStorage.setItem(COCKPIT_PLACEMENT_STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

export function isCockpitPlacementGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('firstPersonGui') || params.has('cockpitGui') || params.has('fpGui')
}

function applyCockpitPlacement(
  group: THREE.Group,
  model: THREE.Object3D | null,
  placement: CockpitPlacement,
): void {
  group.position.set(placement.x, placement.y, placement.z)
  if (model) {
    model.scale.setScalar(placement.scale)
    model.rotation.y = THREE.MathUtils.degToRad(placement.yawDeg + placement.forwardYawDeg)
  }
}

function boxForObjects(objects: THREE.Object3D[]): THREE.Box3 | null {
  const box = new THREE.Box3()
  let hasBox = false
  for (const obj of objects) {
    const next = new THREE.Box3().setFromObject(obj)
    if (next.isEmpty()) continue
    if (hasBox) box.union(next)
    else box.copy(next)
    hasBox = true
  }
  return hasBox ? box : null
}

function objectIsDescendantOf(obj: THREE.Object3D, possibleParent: THREE.Object3D): boolean {
  let parent = obj.parent
  while (parent) {
    if (parent === possibleParent) return true
    parent = parent.parent
  }
  return false
}

function dedupeTopLevelObjects(objects: THREE.Object3D[]): THREE.Object3D[] {
  const unique = Array.from(new Map(objects.map((obj) => [obj.uuid, obj])).values())
  return unique.filter((obj) => !unique.some((other) => other !== obj && objectIsDescendantOf(obj, other)))
}

function expandWheelParts(model: THREE.Object3D, seedParts: THREE.Object3D[]): THREE.Object3D[] {
  const topLevelSeeds = dedupeTopLevelObjects(seedParts)
  if (topLevelSeeds.some((part) => part.children.length > 0)) return topLevelSeeds
  const seedBox = boxForObjects(seedParts)
  if (!seedBox) return topLevelSeeds
  const seedCenter = seedBox.getCenter(new THREE.Vector3())
  const seedSize = seedBox.getSize(new THREE.Vector3())
  const seedMax = Math.max(seedSize.x, seedSize.y, seedSize.z, 1e-5)
  const seedRadius = Math.max(seedSize.x, seedSize.y) * 0.5
  const searchBox = seedBox.clone().expandByScalar(seedMax * 0.42)
  const expanded = [...topLevelSeeds]
  const candidateBox = new THREE.Box3()
  const candidateCenter = new THREE.Vector3()
  const candidateSize = new THREE.Vector3()

  model.updateMatrixWorld(true)
  model.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    if (topLevelSeeds.some((part) => part === obj || objectIsDescendantOf(obj, part) || objectIsDescendantOf(part, obj))) return
    candidateBox.setFromObject(obj)
    if (candidateBox.isEmpty()) return
    candidateBox.getCenter(candidateCenter)
    candidateBox.getSize(candidateSize)
    const candidateMax = Math.max(candidateSize.x, candidateSize.y, candidateSize.z)
    const candidateMin = Math.min(candidateSize.x, candidateSize.y, candidateSize.z)
    if (candidateMax > seedMax * 1.45) return
    if (candidateMax < seedMax * 0.08) return
    if (candidateMin / Math.max(candidateMax, 1e-5) < 0.025) return
    const distance = candidateCenter.distanceTo(seedCenter)
    const intersectsWheelArea = searchBox.intersectsBox(candidateBox) || distance <= Math.max(seedRadius * 1.2, seedMax * 0.55)
    if (!intersectsWheelArea) return
    expanded.push(obj)
  })
  return dedupeTopLevelObjects(expanded)
}

function objectCandidate(obj: THREE.Object3D, whole: THREE.Box3): CandidatePart | null {
  const box = new THREE.Box3().setFromObject(obj)
  if (box.isEmpty()) return null
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const wholeCenter = whole.getCenter(new THREE.Vector3())
  const wholeSize = whole.getSize(new THREE.Vector3())
  const centerX = Math.abs(center.x - wholeCenter.x) / Math.max(wholeSize.x, 1e-5)
  const centerY = (center.y - whole.min.y) / Math.max(wholeSize.y, 1e-5)
  const widthRatio = size.x / Math.max(wholeSize.x, 1e-5)
  const depthRatio = size.z / Math.max(wholeSize.z, 1e-5)
  const flatness = 1 - THREE.MathUtils.clamp(depthRatio / Math.max(widthRatio, 1e-5), 0, 1)
  const score =
    (1 - Math.min(1, centerX * 3)) * 1.6 +
    THREE.MathUtils.clamp(centerY, 0, 1) * 0.8 +
    THREE.MathUtils.clamp(widthRatio * 2.2, 0, 1) * 1.1 +
    flatness * 1.0
  return { obj, name: obj.name, center, size, score }
}

function chooseSteeringWheel(model: THREE.Object3D, wheels: Set<THREE.Object3D>): CandidatePart | null {
  const whole = new THREE.Box3().setFromObject(model)
  const wholeSize = whole.getSize(new THREE.Vector3())
  const candidates: CandidatePart[] = []
  model.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh || wheels.has(obj)) return
    const candidate = objectCandidate(obj, whole)
    if (!candidate) return
    const sx = candidate.size.x / Math.max(wholeSize.x, 1e-5)
    const sz = candidate.size.z / Math.max(wholeSize.z, 1e-5)
    const sy = candidate.size.y / Math.max(wholeSize.y, 1e-5)
    if (sx < 0.18 || sx > 0.65) return
    if (sz > 0.18) return
    if (sy > 0.55) return
    candidates.push(candidate)
  })
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] ?? null
}

function chooseHandCandidates(
  model: THREE.Object3D,
  wheels: Set<THREE.Object3D>,
  steeringWheel: CandidatePart | null,
): CandidatePart[] {
  if (!steeringWheel) return []
  const whole = new THREE.Box3().setFromObject(model)
  const wholeSize = whole.getSize(new THREE.Vector3())
  const candidates: CandidatePart[] = []
  model.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh || wheels.has(obj) || obj === steeringWheel.obj) return
    const candidate = objectCandidate(obj, whole)
    if (!candidate) return
    const dist = candidate.center.distanceTo(steeringWheel.center)
    const maxSize = Math.max(candidate.size.x, candidate.size.y, candidate.size.z)
    if (dist > Math.max(wholeSize.x, wholeSize.z) * 0.45) return
    if (maxSize < Math.max(wholeSize.x, wholeSize.z) * 0.035) return
    if (maxSize > Math.max(wholeSize.x, wholeSize.z) * 0.34) return
    const lateral = Math.abs(candidate.center.x - steeringWheel.center.x)
    candidate.score = lateral * 1.5 - dist * 0.8 + candidate.score * 0.25
    candidates.push(candidate)
  })
  candidates.sort((a, b) => b.score - a.score)

  const left = candidates.find((item) => item.center.x < steeringWheel.center.x - 0.03)
  const right = candidates.find((item) => item.center.x > steeringWheel.center.x + 0.03)
  return [left, right].filter((item): item is CandidatePart => Boolean(item))
}

function createPivotForParts(
  model: THREE.Object3D,
  parts: THREE.Object3D[],
  centerWorld: THREE.Vector3,
  name: string,
): PivotRef {
  const pivot = new THREE.Group()
  pivot.name = name
  model.add(pivot)
  model.updateMatrixWorld(true)
  pivot.position.copy(model.worldToLocal(centerWorld.clone()))
  pivot.updateMatrixWorld(true)
  for (const part of parts) {
    pivot.attach(part)
  }
  pivot.updateMatrixWorld(true)
  return {
    pivot,
    baseQuaternion: pivot.quaternion.clone(),
  }
}

function createWheelRig(model: THREE.Object3D, parts: THREE.Object3D[], name: string): FirstPersonWheelRef | null {
  const box = boxForObjects(parts)
  if (!box) return null
  const center = box.getCenter(new THREE.Vector3())
  const steerPivot = createPivotForParts(model, parts, center, `${name}-steer-pivot`)
  const spinPivot = new THREE.Group()
  spinPivot.name = `${name}-spin-pivot`
  steerPivot.pivot.add(spinPivot)
  spinPivot.updateMatrixWorld(true)
  for (const part of parts) {
    spinPivot.attach(part)
  }
  spinPivot.updateMatrixWorld(true)
  return {
    steerPivot,
    spinPivot: {
      pivot: spinPivot,
      baseQuaternion: spinPivot.quaternion.clone(),
    },
    spinAxis: WHEEL_SPIN_AXIS.clone(),
    spin: 0,
  }
}

function createSteeringRig(
  model: THREE.Object3D,
  steeringWheelParts: THREE.Object3D[],
  handParts: THREE.Object3D[],
): SteeringRigRef | null {
  const wheelBox = boxForObjects(steeringWheelParts)
  if (!wheelBox) return null
  const parts = [...steeringWheelParts, ...handParts]
  return {
    pivot: createPivotForParts(
      model,
      parts,
      wheelBox.getCenter(new THREE.Vector3()),
      'first-person-steering-wheel-pivot',
    ),
  }
}

function installCockpitPlacementGui(
  group: THREE.Group,
  getModel: () => THREE.Object3D | null,
  placement: CockpitPlacement,
  getViewMode: () => CockpitEditorViewMode,
  setViewMode: (mode: CockpitEditorViewMode) => void,
  getDragTarget: () => CockpitDragTarget,
  setDragTarget: (target: CockpitDragTarget) => void,
  onSnapModelToGround: (() => void) | undefined,
  onChange: () => void,
): CockpitPlacementGuiController {
  const getForwardFaceLabel = (): string => (
    COCKPIT_FORWARD_FACE_OPTIONS.find((option) => option.yawDeg === placement.forwardYawDeg)?.label ??
    `${placement.forwardYawDeg.toFixed(0)}°`
  )
  const panel = document.createElement('div')
  panel.style.cssText = [
    'position:fixed',
    'right:18px',
    'bottom:18px',
    'z-index:10000',
    'width:min(300px,calc(100vw - 36px))',
    'max-height:calc(100vh - 36px)',
    'overflow:auto',
    'overscroll-behavior:contain',
    'padding:12px',
    'border-radius:8px',
    'background:rgba(6,12,18,.84)',
    'color:#eaffff',
    'font:12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
    'box-shadow:0 12px 32px rgba(0,0,0,.35)',
    'backdrop-filter:blur(8px)',
    'pointer-events:auto',
  ].join(';')
  const title = document.createElement('div')
  title.textContent = '第一人称视点调试'
  title.style.cssText = 'font-weight:700;color:#67f8ff;margin-bottom:8px'
  panel.appendChild(title)
  const viewRow = document.createElement('div')
  viewRow.style.cssText = 'display:flex;gap:8px;margin-bottom:10px'
  const firstButton = document.createElement('button')
  const thirdButton = document.createElement('button')
  const styleButton = (button: HTMLButtonElement, active: boolean): void => {
    button.style.cssText = [
      'flex:1',
      'padding:7px 8px',
      'border:0',
      'border-radius:6px',
      `background:${active ? '#67f8ff' : 'rgba(255,255,255,.14)'}`,
      `color:${active ? '#061018' : '#eaffff'}`,
      'font-weight:700',
      'cursor:pointer',
    ].join(';')
  }
  const refreshViewButtons = (): void => {
    styleButton(firstButton, getViewMode() === 'first')
    styleButton(thirdButton, getViewMode() === 'third')
  }
  firstButton.textContent = '第一视角'
  thirdButton.textContent = '第三视角'
  firstButton.addEventListener('click', () => {
    setViewMode('first')
    refreshViewButtons()
    onChange()
  })
  thirdButton.addEventListener('click', () => {
    setViewMode('third')
    refreshViewButtons()
    onChange()
  })
  viewRow.append(firstButton, thirdButton)
  panel.appendChild(viewRow)
  refreshViewButtons()

  const dragRow = document.createElement('div')
  dragRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px'
  const modelDragButton = document.createElement('button')
  const cameraDragButton = document.createElement('button')
  const refreshDragButtons = (): void => {
    styleButton(modelDragButton, getDragTarget() === 'model')
    styleButton(cameraDragButton, getDragTarget() === 'camera')
  }
  modelDragButton.textContent = '拖GLB'
  cameraDragButton.textContent = '车上相机'
  modelDragButton.addEventListener('click', () => {
    setDragTarget('model')
    refreshDragButtons()
    onChange()
  })
  cameraDragButton.addEventListener('click', () => {
    setDragTarget('camera')
    refreshDragButtons()
    onChange()
  })
  dragRow.append(modelDragButton, cameraDragButton)
  panel.appendChild(dragRow)
  refreshDragButtons()

  if (onSnapModelToGround) {
    const snapRow = document.createElement('div')
    snapRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px'
    const snapButton = document.createElement('button')
    styleButton(snapButton, false)
    snapButton.textContent = 'GLB贴地'
    snapButton.addEventListener('click', () => {
      onSnapModelToGround()
      renderOutput()
    })
    snapRow.appendChild(snapButton)
    panel.appendChild(snapRow)
  }

  const hint = document.createElement('div')
  hint.textContent = '黄色方块就是第一视角相机。Eye X/Y/Z 调整相机位置，Camera Pitch/Yaw/Roll 调整视角角度。'
  hint.style.cssText = 'color:rgba(234,255,255,.72);font-size:11px;margin-bottom:8px'
  panel.appendChild(hint)

  const setPlacementValue = (key: keyof CockpitPlacement, next: number): void => {
    const normalized = normalizeCockpitPlacement({ ...placement, [key]: next })
    if (!normalized) return
    Object.assign(placement, normalized)
  }
  const forwardFaceHeading = document.createElement('div')
  forwardFaceHeading.textContent = '第一视角方向选择'
  forwardFaceHeading.style.cssText = 'margin:10px 0 5px;color:#67f8ff;font-weight:700'
  panel.appendChild(forwardFaceHeading)

  const forwardFaceRow = document.createElement('div')
  forwardFaceRow.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px'
  const forwardFaceButtons: HTMLButtonElement[] = []
  const refreshForwardFaceButtons = (): void => {
    for (const button of forwardFaceButtons) {
      const yawDeg = Number(button.dataset.yawDeg)
      styleButton(button, yawDeg === placement.forwardYawDeg)
      button.style.padding = '6px 4px'
      button.style.fontSize = '11px'
    }
  }
  for (const option of COCKPIT_FORWARD_FACE_OPTIONS) {
    const button = document.createElement('button')
    button.textContent = option.label
    button.dataset.yawDeg = String(option.yawDeg)
    button.addEventListener('click', () => {
      setPlacementValue('forwardYawDeg', option.yawDeg)
      refreshForwardFaceButtons()
      renderOutput()
    })
    forwardFaceButtons.push(button)
    forwardFaceRow.appendChild(button)
  }
  panel.appendChild(forwardFaceRow)
  refreshForwardFaceButtons()

  const fields: CockpitGuiField[] = [
    {
      id: 'eyeX',
      label: 'Eye X',
      section: '第一视角相机',
      min: -2,
      max: 2,
      step: 0.01,
      get: () => -placement.x,
      set: (next) => setPlacementValue('x', -next),
    },
    {
      id: 'eyeY',
      label: 'Eye Y',
      section: '第一视角相机',
      min: -0.5,
      max: 3,
      step: 0.01,
      get: () => -placement.y,
      set: (next) => setPlacementValue('y', -next),
    },
    {
      id: 'eyeZ',
      label: 'Eye Z',
      section: '第一视角相机',
      min: 0,
      max: 6,
      step: 0.01,
      get: () => -placement.z,
      set: (next) => setPlacementValue('z', -next),
    },
    {
      id: 'eyeYaw',
      label: 'Eye Yaw',
      section: '第一视角相机',
      min: -360,
      max: 360,
      step: 0.1,
      get: () => -placement.yawDeg,
      set: (next) => setPlacementValue('yawDeg', -next),
    },
    {
      id: 'scale',
      label: 'Scale',
      section: '第一视角相机',
      min: 0.5,
      max: 4.5,
      step: 0.01,
      get: () => placement.scale,
      set: (next) => setPlacementValue('scale', next),
    },
    {
      id: 'viewPitch',
      label: 'Cam Pitch',
      section: '黄色相机方块旋转',
      min: -45,
      max: 45,
      step: 0.1,
      get: () => placement.viewPitchDeg,
      set: (next) => setPlacementValue('viewPitchDeg', next),
    },
    {
      id: 'viewYaw',
      label: 'Cam Yaw',
      section: '黄色相机方块旋转',
      min: -90,
      max: 90,
      step: 0.1,
      get: () => placement.viewYawDeg,
      set: (next) => setPlacementValue('viewYawDeg', next),
    },
    {
      id: 'viewRoll',
      label: 'Cam Roll',
      section: '黄色相机方块旋转',
      min: -45,
      max: 45,
      step: 0.1,
      get: () => placement.viewRollDeg,
      set: (next) => setPlacementValue('viewRollDeg', next),
    },
    {
      id: 'cameraX',
      label: 'Cam X',
      section: '车辆上的黄色相机',
      min: -3,
      max: 3,
      step: 0.01,
      get: () => placement.cameraX,
      set: (next) => setPlacementValue('cameraX', next),
    },
    {
      id: 'cameraY',
      label: 'Cam Height',
      section: '车辆上的黄色相机',
      min: -1,
      max: 4,
      step: 0.01,
      get: () => placement.cameraY,
      set: (next) => setPlacementValue('cameraY', next),
    },
    {
      id: 'cameraZ',
      label: 'Cam Z',
      section: '车辆上的黄色相机',
      min: -5,
      max: 6,
      step: 0.01,
      get: () => placement.cameraZ,
      set: (next) => setPlacementValue('cameraZ', next),
    },
  ]
  const output = document.createElement('pre')
  output.style.cssText = [
    'white-space:pre-wrap',
    'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
    'margin:10px 0 0',
    'padding:8px',
    'border-radius:6px',
    'background:rgba(0,0,0,.28)',
    'color:#d9ffff',
  ].join(';')

  const inputRefs = new Map<string, { range: HTMLInputElement; number: HTMLInputElement }>()

  const syncInputsFromPlacement = (): void => {
    for (const field of fields) {
      const refs = inputRefs.get(field.id)
      if (!refs) continue
      const value = Number(field.get().toFixed(field.step < 0.1 ? 2 : 1))
      refs.range.value = String(value)
      refs.number.value = String(value)
    }
  }

  const renderOutput = (notify = true): void => {
    applyCockpitPlacement(group, getModel(), placement)
    writeCockpitPlacement(placement)
    if (notify) onChange()
    output.textContent = [
      'const DEFAULT_COCKPIT_PLACEMENT: CockpitPlacement = {',
      `  x: ${placement.x.toFixed(2)},`,
      `  y: ${placement.y.toFixed(2)},`,
      `  z: ${placement.z.toFixed(2)},`,
      `  yawDeg: ${placement.yawDeg.toFixed(1)},`,
      `  forwardYawDeg: ${placement.forwardYawDeg.toFixed(1)},`,
      `  cameraX: ${placement.cameraX.toFixed(2)},`,
      `  cameraY: ${placement.cameraY.toFixed(2)},`,
      `  cameraZ: ${placement.cameraZ.toFixed(2)},`,
      `  viewPitchDeg: ${placement.viewPitchDeg.toFixed(1)},`,
      `  viewYawDeg: ${placement.viewYawDeg.toFixed(1)},`,
      `  viewRollDeg: ${placement.viewRollDeg.toFixed(1)},`,
      `  scale: ${placement.scale.toFixed(2)},`,
      '}',
      '',
      '// GUI 视角读数:第一视角相机',
      `Eye X ${(-placement.x).toFixed(2)}  Eye Y ${(-placement.y).toFixed(2)}  Eye Z ${(-placement.z).toFixed(2)}`,
      `Eye Yaw ${(-placement.yawDeg).toFixed(1)}°`,
      `GLB Front ${getForwardFaceLabel()} (${placement.forwardYawDeg.toFixed(0)}°)`,
      `Camera Pitch ${placement.viewPitchDeg.toFixed(1)}°  Yaw ${placement.viewYawDeg.toFixed(1)}°  Roll ${placement.viewRollDeg.toFixed(1)}°`,
    ].join('\n')
  }

  let lastSection = ''
  for (const field of fields) {
    if (field.section !== lastSection) {
      lastSection = field.section
      const heading = document.createElement('div')
      heading.textContent = field.section
      heading.style.cssText = 'margin:10px 0 5px;color:#67f8ff;font-weight:700'
      panel.appendChild(heading)
    }
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:70px 1fr 58px;gap:8px;align-items:center;margin:7px 0'
    const label = document.createElement('span')
    label.textContent = field.label
    const range = document.createElement('input')
    range.type = 'range'
    range.min = String(field.min)
    range.max = String(field.max)
    range.step = String(field.step)
    range.value = String(field.get())
    const number = document.createElement('input')
    number.type = 'number'
    number.min = String(field.min)
    number.max = String(field.max)
    number.step = String(field.step)
    number.value = String(field.get())
    number.style.cssText = 'width:58px;background:#07131b;color:#eaffff;border:1px solid rgba(103,248,255,.35);border-radius:4px'
    const sync = (next: number): void => {
      field.set(next)
      const value = Number(field.get().toFixed(field.step < 0.1 ? 2 : 1))
      range.value = String(value)
      number.value = String(value)
      renderOutput()
    }
    range.addEventListener('input', () => sync(Number(range.value)))
    number.addEventListener('input', () => sync(Number(number.value)))
    inputRefs.set(field.id, { range, number })
    row.append(label, range, number)
    panel.appendChild(row)
  }

  const reset = document.createElement('button')
  reset.textContent = '恢复默认'
  reset.style.cssText = 'margin-top:8px;padding:6px 9px;border:0;border-radius:6px;background:#67f8ff;color:#061018;font-weight:700;cursor:pointer'
  reset.addEventListener('click', () => {
    Object.assign(placement, DEFAULT_COCKPIT_PLACEMENT)
    writeCockpitPlacement(placement)
    refreshForwardFaceButtons()
    syncInputsFromPlacement()
    renderOutput()
  })
  panel.appendChild(reset)
  panel.appendChild(output)
  document.body.appendChild(panel)
  renderOutput()
  return {
    dispose: () => panel.remove(),
    refresh: () => {
      refreshForwardFaceButtons()
      syncInputsFromPlacement()
      renderOutput(false)
    },
  }
}

export function createFirstPersonCockpit(options: FirstPersonCockpitOptions = {}): FirstPersonCockpitBundle {
  const group = new THREE.Group()
  group.name = 'first-person-cockpit'
  group.visible = false
  const placement = readCockpitPlacement()
  applyCockpitPlacement(group, null, placement)

  const wheels: FirstPersonWheelRef[] = []
  let steeringRig: SteeringRigRef | null = null
  let cockpitModel: THREE.Object3D | null = null
  let cockpitGui: CockpitPlacementGuiController | null = null
  let placementRevision = 0
  let editorViewMode: CockpitEditorViewMode = isCockpitPlacementGuiEnabled() ? 'third' : 'first'
  let dragTarget: CockpitDragTarget = 'model'
  let currentSteer = 0
  const steerQuat = new THREE.Quaternion()
  const spinQuat = new THREE.Quaternion()
  const steeringWheelQuat = new THREE.Quaternion()

  const ready = Promise.resolve()
  if (isCockpitPlacementGuiEnabled()) {
    cockpitGui = installCockpitPlacementGui(
      group,
      () => cockpitModel,
      placement,
      () => editorViewMode,
      (mode) => {
        editorViewMode = mode
      },
      () => dragTarget,
      (target) => {
        dragTarget = target
      },
      options.onSnapModelToGround,
      () => {
        placementRevision++
      },
    )
  }

  const update = (dt: number, speed01: number, steer = 0): void => {
    currentSteer += (THREE.MathUtils.clamp(steer, -1, 1) - currentSteer) * 0.28
    const spinStep = -speed01 * 38 * dt
    steerQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -currentSteer * WHEEL_STEER_MAX_RAD)
    for (const wheel of wheels) {
      wheel.steerPivot.pivot.quaternion.copy(wheel.steerPivot.baseQuaternion).multiply(steerQuat)
      wheel.spin = (wheel.spin + spinStep) % (Math.PI * 2)
      spinQuat.setFromAxisAngle(wheel.spinAxis, wheel.spin)
      wheel.spinPivot.pivot.quaternion.copy(wheel.spinPivot.baseQuaternion).multiply(spinQuat)
    }
    if (steeringRig) {
      steeringWheelQuat.setFromAxisAngle(STEERING_WHEEL_AXIS, -currentSteer * STEERING_WHEEL_MAX_RAD)
      steeringRig.pivot.pivot.quaternion.copy(steeringRig.pivot.baseQuaternion).multiply(steeringWheelQuat)
    }
  }

  const dispose = (): void => {
    cockpitGui?.dispose()
    group.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return
      const mesh = obj as THREE.Mesh
      mesh.geometry?.dispose()
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) mat.dispose()
      } else {
        mesh.material?.dispose()
      }
    })
    group.removeFromParent()
  }

  const getCameraOffset = (): THREE.Vector3 => new THREE.Vector3(
    placement.cameraX,
    placement.cameraY,
    placement.cameraZ,
  )
  const getModelOffset = (): THREE.Vector3 => new THREE.Vector3(
    placement.x,
    placement.y,
    placement.z,
  )
  const getViewRotationOffset = (): THREE.Vector3 => new THREE.Vector3(
    THREE.MathUtils.degToRad(placement.viewPitchDeg),
    THREE.MathUtils.degToRad(placement.viewYawDeg),
    THREE.MathUtils.degToRad(placement.viewRollDeg),
  )
  const getDragTarget = (): CockpitDragTarget => dragTarget
  const getEditorViewMode = (): CockpitEditorViewMode => editorViewMode
  const getPlacementRevision = (): number => placementRevision
  const setCameraOffset = (offset: THREE.Vector3): void => {
    const normalized = normalizeCockpitPlacement({
      ...placement,
      cameraX: offset.x,
      cameraY: offset.y,
      cameraZ: offset.z,
    })
    if (!normalized) return
    Object.assign(placement, normalized)
    writeCockpitPlacement(placement)
    placementRevision++
    cockpitGui?.refresh()
  }
  const setViewRotationOffset = (offset: THREE.Vector3): void => {
    const normalized = normalizeCockpitPlacement({
      ...placement,
      viewPitchDeg: THREE.MathUtils.radToDeg(offset.x),
      viewYawDeg: THREE.MathUtils.radToDeg(offset.y),
      viewRollDeg: THREE.MathUtils.radToDeg(offset.z),
    })
    if (!normalized) return
    Object.assign(placement, normalized)
    writeCockpitPlacement(placement)
    placementRevision++
    cockpitGui?.refresh()
  }
  const setModelOffset = (offset: THREE.Vector3): void => {
    const normalized = normalizeCockpitPlacement({
      ...placement,
      x: offset.x,
      y: offset.y,
      z: offset.z,
    })
    if (!normalized) return
    Object.assign(placement, normalized)
    applyCockpitPlacement(group, cockpitModel, placement)
    writeCockpitPlacement(placement)
    placementRevision++
    cockpitGui?.refresh()
  }

  return {
    group,
    ready,
    getCameraOffset,
    getDragTarget,
    getEditorViewMode,
    getModelOffset,
    getPlacementRevision,
    getViewRotationOffset,
    setCameraOffset,
    setViewRotationOffset,
    setModelOffset,
    update,
    dispose,
  }
}

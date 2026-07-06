import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { showToast } from '../utils/error'

export interface GlbGridPlacementGuiPlacement {
  id: string
  x: number
  z: number
  headingDeg: number
}

interface GroundSamplerLike {
  sampleGroundAt: (x: number, z: number) => { point: THREE.Vector3; normal: THREE.Vector3; isRoad?: boolean } | null
}

export interface GlbGridPlacementGuiOptions {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  ground: GroundSamplerLike
  placements: GlbGridPlacementGuiPlacement[]
  defaultPlacements: GlbGridPlacementGuiPlacement[]
  storageKey: string
  onPlacementChange: (placement: GlbGridPlacementGuiPlacement) => void
  onStartDriving?: () => void
}

type NumericPlacementKey = 'x' | 'z' | 'headingDeg'

interface MarkerRefs {
  id: string
  root: THREE.Group
  hit: THREE.Mesh
  label: THREE.Sprite
  labelTexture: THREE.CanvasTexture
  labelMaterial: THREE.SpriteMaterial
}

interface LabelSpriteRefs {
  sprite: THREE.Sprite
  texture: THREE.CanvasTexture
  material: THREE.SpriteMaterial
}

const GUI_PARAMS = ['gridGui', 'startGridGui', 'gridEditor', 'placeGrid']
const GRID_LABELS: Record<string, string> = {
  player: '玩家',
  ferrari: 'Ferrari',
  mercedes: 'Mercedes',
  mclaren: 'McLaren',
  redbull: 'Red Bull',
}
const GRID_COLORS: Record<string, string> = {
  player: '#38e8ff',
  ferrari: '#ef233c',
  mercedes: '#d8f3dc',
  mclaren: '#ff8c1a',
  redbull: '#335cff',
}
const MARKER_MIN_SCREEN_SCALE = 0.65
const MARKER_MAX_SCREEN_SCALE = 2.15
const MAX_DRAG_STEP = 24

export function isGlbGridPlacementGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return GUI_PARAMS.some((param) => params.has(param))
}

function labelFor(id: string): string {
  return GRID_LABELS[id] ?? id
}

function colorFor(id: string): string {
  return GRID_COLORS[id] ?? '#facc15'
}

function clonePlacements(placements: GlbGridPlacementGuiPlacement[]): GlbGridPlacementGuiPlacement[] {
  return placements.map((item) => ({ ...item }))
}

function fmt(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

function sanitizePlacement(value: GlbGridPlacementGuiPlacement): GlbGridPlacementGuiPlacement {
  return {
    id: value.id,
    x: fmt(value.x),
    z: fmt(value.z),
    headingDeg: fmt(value.headingDeg),
  }
}

function placementsSnippet(placements: GlbGridPlacementGuiPlacement[]): string {
  return [
    'const DEFAULT_GLB_GRID_PLACEMENTS: GlbGridPlacement[] = [',
    ...placements.map((item) =>
      `  { id: '${item.id}', x: ${fmt(item.x)}, z: ${fmt(item.z)}, headingDeg: ${fmt(item.headingDeg)} },`,
    ),
    ']',
  ].join('\n')
}

function writePlacements(storageKey: string, placements: GlbGridPlacementGuiPlacement[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(placements.map(sanitizePlacement)))
  } catch {
    /* noop */
  }
}

function removeSavedPlacements(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    /* noop */
  }
}

function makeLabelSprite(text: string, color: string): LabelSpriteRefs {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 72
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(5,8,12,0.82)'
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(8, 8, 240, 56, 12)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 28px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 37, 220)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(5.8, 1.65, 1)
  sprite.renderOrder = 400
  return { sprite, texture, material }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function installGlbGridPlacementGui(options: GlbGridPlacementGuiOptions): () => void {
  let placements = clonePlacements(options.placements)
  const defaultPlacements = clonePlacements(options.defaultPlacements)
  let activeId = placements.find((item) => item.id === 'player')?.id ?? placements[0]?.id ?? ''
  let draggingId: string | null = null
  let dragOffset = new THREE.Vector3()
  let disposed = false
  let labelsVisible = false
  let markersVisible = true
  let lastRejectedToastAt = 0

  const root = new THREE.Group()
  root.name = 'glb-grid-placement-gui'
  options.scene.add(root)

  const cameraControls = new OrbitControls(options.camera, options.renderer.domElement)
  cameraControls.enableDamping = false
  cameraControls.enablePan = true
  cameraControls.enableRotate = true
  cameraControls.enableZoom = true
  cameraControls.screenSpacePanning = true
  cameraControls.panSpeed = 0.9
  cameraControls.rotateSpeed = 0.55
  cameraControls.zoomSpeed = 0.85
  cameraControls.minDistance = 7
  cameraControls.maxDistance = 900
  cameraControls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  }
  cameraControls.touches = {
    ONE: THREE.TOUCH.PAN,
    TWO: THREE.TOUCH.DOLLY_ROTATE,
  }

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const dragPoint = new THREE.Vector3()
  const nextDragPoint = new THREE.Vector3()
  const markers = new Map<string, MarkerRefs>()
  const hitMeshes: THREE.Mesh[] = []

  const discGeo = new THREE.CircleGeometry(1.15, 36)
  const ringGeo = new THREE.TorusGeometry(1.35, 0.06, 8, 36)
  const crossGeo = new THREE.BoxGeometry(2.8, 0.035, 0.09)
  const hitGeo = new THREE.SphereGeometry(3.0, 16, 10)
  const shaftGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.2, 8)
  const coneGeo = new THREE.ConeGeometry(0.18, 0.45, 12)
  const markerMaterials: THREE.Material[] = []

  const placementFor = (id: string): GlbGridPlacementGuiPlacement | null =>
    placements.find((item) => item.id === id) ?? null

  const sampleY = (placement: GlbGridPlacementGuiPlacement): number => {
    const hit = options.ground.sampleGroundAt(placement.x, placement.z)
    return hit?.point.y ?? 0
  }

  const canPlaceAt = (x: number, z: number): boolean => {
    const hit = options.ground.sampleGroundAt(x, z)
    return Boolean(hit)
  }

  const showRejectedPlacementToast = (): void => {
    const now = performance.now()
    if (now - lastRejectedToastAt < 900) return
    lastRejectedToastAt = now
    showToast('这里没有可用地面', 900)
  }

  const updateMarker = (placement: GlbGridPlacementGuiPlacement): void => {
    const marker = markers.get(placement.id)
    if (!marker) return
    marker.root.position.set(placement.x, sampleY(placement) + 2.25, placement.z)
    marker.root.rotation.y = THREE.MathUtils.degToRad(placement.headingDeg)
    const cameraDistance = marker.root.position.distanceTo(options.camera.position)
    const screenScale = clamp(cameraDistance / 92, MARKER_MIN_SCREEN_SCALE, MARKER_MAX_SCREEN_SCALE)
    marker.root.scale.setScalar(screenScale * (placement.id === activeId ? 1.18 : 1))
  }

  const refreshMarkerVisibility = (): void => {
    for (const marker of markers.values()) {
      marker.root.visible = markersVisible
      marker.label.visible = markersVisible && labelsVisible
    }
  }

  const refreshMarkers = (): void => {
    for (const placement of placements) updateMarker(placement)
    refreshMarkerVisibility()
  }

  const createMarker = (placement: GlbGridPlacementGuiPlacement): void => {
    const group = new THREE.Group()
    group.name = `grid-placement-marker-${placement.id}`

    const color = colorFor(placement.id)
    const discMat = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    })
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    })
    const crossMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    })
    const arrowMat = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false })
    const hitMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })
    markerMaterials.push(discMat, ringMat, crossMat, arrowMat, hitMat)

    const disc = new THREE.Mesh(discGeo, discMat)
    disc.rotation.x = -Math.PI / 2
    disc.renderOrder = 318
    group.add(disc)

    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = Math.PI / 2
    ring.renderOrder = 320
    group.add(ring)

    const crossA = new THREE.Mesh(crossGeo, crossMat)
    crossA.position.y = 0.04
    crossA.renderOrder = 321
    group.add(crossA)

    const crossB = new THREE.Mesh(crossGeo, crossMat)
    crossB.rotation.y = Math.PI / 2
    crossB.position.y = 0.05
    crossB.renderOrder = 321
    group.add(crossB)

    const shaft = new THREE.Mesh(shaftGeo, arrowMat)
    shaft.rotation.x = Math.PI / 2
    shaft.position.z = 1.1
    shaft.position.y = 0.08
    shaft.renderOrder = 322
    group.add(shaft)

    const cone = new THREE.Mesh(coneGeo, arrowMat)
    cone.rotation.x = Math.PI / 2
    cone.position.z = 1.9
    cone.position.y = 0.08
    cone.renderOrder = 323
    group.add(cone)

    const hit = new THREE.Mesh(hitGeo, hitMat)
    hit.userData.gridPlacementId = placement.id
    group.add(hit)
    hitMeshes.push(hit)

    const label = makeLabelSprite(labelFor(placement.id), color)
    label.sprite.position.y = 2.15
    group.add(label.sprite)

    root.add(group)
    markers.set(placement.id, {
      id: placement.id,
      root: group,
      hit,
      label: label.sprite,
      labelTexture: label.texture,
      labelMaterial: label.material,
    })
    updateMarker(placement)
  }

  for (const placement of placements) createMarker(placement)

  const host = document.createElement('div')
  host.style.cssText = `
    position: fixed; right: 16px; top: 16px; z-index: 260;
    width: min(430px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    overflow: auto; padding: 14px;
    background: rgba(8,12,20,0.93); color: #fff;
    border: 1px solid rgba(255,255,255,0.16); border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    box-shadow: 0 16px 40px rgba(0,0,0,0.38);
  `
  host.addEventListener('pointerdown', (ev) => ev.stopPropagation())

  const titleBar = document.createElement('div')
  titleBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px;cursor:move;user-select:none;'

  const title = document.createElement('div')
  title.textContent = '发车格编辑器'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;'

  const collapseButton = document.createElement('button')
  collapseButton.type = 'button'
  collapseButton.textContent = '收起'
  collapseButton.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:5px 8px;cursor:pointer;'

  titleBar.append(title, collapseButton)
  host.appendChild(titleBar)

  const body = document.createElement('div')
  host.appendChild(body)

  const hint = document.createElement('div')
  hint.textContent = '空白处拖动平移，滚轮缩放，右键旋转；拖动车上的彩色标记改发车位。'
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  body.appendChild(hint)

  const carButtons = document.createElement('div')
  carButtons.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:10px;'
  body.appendChild(carButtons)

  const controls: Array<{
    key: NumericPlacementKey
    input: HTMLInputElement
    number: HTMLInputElement
  }> = []
  let fineMoveStep = 0.1
  let fineAngleStep = 0.1
  const output = document.createElement('pre')
  output.style.cssText = `
    margin: 10px 0 0; padding: 10px; border-radius: 6px;
    background: rgba(255,255,255,0.08); color: #dff;
    font-size: 11px; white-space: pre-wrap; user-select: text;
  `

  const applyPlacement = (
    id: string,
    patch: Partial<Omit<GlbGridPlacementGuiPlacement, 'id'>>,
    persist = true,
  ): void => {
    const index = placements.findIndex((item) => item.id === id)
    if (index < 0) return
    const next = sanitizePlacement({ ...placements[index], ...patch })
    if ((patch.x !== undefined || patch.z !== undefined) && !canPlaceAt(next.x, next.z)) {
      showRejectedPlacementToast()
      return
    }
    placements[index] = next
    options.onPlacementChange(placements[index])
    updateMarker(placements[index])
    if (persist) writePlacements(options.storageKey, placements)
    refresh()
  }

  const nudgeActive = (forwardMeters: number, rightMeters: number): void => {
    const active = placementFor(activeId)
    if (!active) return
    const heading = THREE.MathUtils.degToRad(active.headingDeg)
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
    const right = new THREE.Vector3(forward.z, 0, -forward.x)
    applyPlacement(activeId, {
      x: active.x + forward.x * forwardMeters + right.x * rightMeters,
      z: active.z + forward.z * forwardMeters + right.z * rightMeters,
    })
  }

  const nudgeHeading = (deltaDeg: number): void => {
    const active = placementFor(activeId)
    if (!active) return
    applyPlacement(activeId, { headingDeg: active.headingDeg + deltaDeg })
  }

  const setActive = (id: string, focus = false): void => {
    activeId = id
    refresh()
    refreshMarkers()
    if (focus) setCamera('active')
  }

  const refreshCarButtons = (): void => {
    carButtons.innerHTML = ''
    for (const placement of placements) {
      const button = document.createElement('button')
      const active = placement.id === activeId
      button.textContent = labelFor(placement.id)
      button.style.cssText = [
        'border-radius:6px',
        `border:1px solid ${active ? colorFor(placement.id) : '#475569'}`,
        `background:${active ? 'rgba(255,255,255,0.14)' : '#111827'}`,
        'color:#fff',
        'padding:8px 9px',
        'cursor:pointer',
        'font-weight:700',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'white-space:nowrap',
      ].join(';')
      button.addEventListener('click', () => setActive(placement.id, true))
      carButtons.appendChild(button)
    }
  }

  const refresh = (): void => {
    const active = placementFor(activeId)
    if (!active) return
    refreshCarButtons()
    for (const control of controls) {
      const value = String(active[control.key])
      control.input.value = value
      control.number.value = value
    }
    output.textContent = placementsSnippet(placements)
  }

  const addSlider = (
    key: NumericPlacementKey,
    label: string,
    min: number,
    max: number,
    step: number,
  ): void => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:74px 1fr 88px;gap:8px;align-items:center;margin:8px 0;'

    const text = document.createElement('span')
    text.textContent = label
    text.style.cssText = 'font-size:12px;color:#ccd;'

    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)

    const number = document.createElement('input')
    number.type = 'number'
    number.min = String(min)
    number.max = String(max)
    number.step = String(step)
    number.style.cssText = 'width:86px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px;'

    const onInput = (raw: string): void => {
      const value = Number(raw)
      if (Number.isFinite(value)) applyPlacement(activeId, { [key]: value })
    }
    input.addEventListener('input', () => onInput(input.value))
    number.addEventListener('input', () => onInput(number.value))

    controls.push({ key, input, number })
    row.append(text, input, number)
    body.appendChild(row)
  }

  addSlider('x', 'X', -2600, 2600, 0.1)
  addSlider('z', 'Z', -2600, 2600, 0.1)
  addSlider('headingDeg', '角度', -360, 360, 0.1)

  const fineTunePanel = document.createElement('div')
  fineTunePanel.style.cssText = 'margin:12px 0 8px;padding:10px;border:1px solid rgba(255,255,255,0.14);border-radius:8px;background:rgba(255,255,255,0.055);'
  const fineTitle = document.createElement('div')
  fineTitle.textContent = '微调选中赛车'
  fineTitle.style.cssText = 'font-size:13px;font-weight:800;margin-bottom:8px;color:#fff;'
  fineTunePanel.appendChild(fineTitle)

  const stepRow = document.createElement('div')
  stepRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:9px;'

  const makeStepInput = (
    label: string,
    value: number,
    min: number,
    step: number,
    onChange: (value: number) => void,
  ): HTMLLabelElement => {
    const wrapper = document.createElement('label')
    wrapper.style.cssText = 'display:grid;grid-template-columns:54px 1fr;gap:6px;align-items:center;font-size:12px;color:#ccd;'
    const text = document.createElement('span')
    text.textContent = label
    const input = document.createElement('input')
    input.type = 'number'
    input.min = String(min)
    input.step = String(step)
    input.value = String(value)
    input.style.cssText = 'min-width:0;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:5px;'
    input.addEventListener('input', () => {
      const next = Number(input.value)
      if (Number.isFinite(next) && next > 0) onChange(next)
    })
    wrapper.append(text, input)
    return wrapper
  }

  stepRow.append(
    makeStepInput('位移', fineMoveStep, 0.01, 0.01, (value) => {
      fineMoveStep = value
    }),
    makeStepInput('角度', fineAngleStep, 0.01, 0.01, (value) => {
      fineAngleStep = value
    }),
  )
  fineTunePanel.appendChild(stepRow)

  const nudgeGrid = document.createElement('div')
  nudgeGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;'
  const addNudgeButton = (text: string, onClick: () => void): void => {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 8px;cursor:pointer;font-weight:700;'
    btn.addEventListener('click', onClick)
    nudgeGrid.appendChild(btn)
  }
  addNudgeButton('左转', () => nudgeHeading(-fineAngleStep))
  addNudgeButton('前', () => nudgeActive(fineMoveStep, 0))
  addNudgeButton('右转', () => nudgeHeading(fineAngleStep))
  addNudgeButton('左', () => nudgeActive(0, -fineMoveStep))
  addNudgeButton('近看', () => setCamera('active'))
  addNudgeButton('右', () => nudgeActive(0, fineMoveStep))
  addNudgeButton('-角度', () => nudgeHeading(-fineAngleStep * 5))
  addNudgeButton('后', () => nudgeActive(-fineMoveStep, 0))
  addNudgeButton('+角度', () => nudgeHeading(fineAngleStep * 5))
  fineTunePanel.appendChild(nudgeGrid)
  body.appendChild(fineTunePanel)

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;'
  const addButton = (text: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;'
    btn.addEventListener('click', onClick)
    buttonRow.appendChild(btn)
    return btn
  }

  let labelToggleButton: HTMLButtonElement | null = null
  let markerToggleButton: HTMLButtonElement | null = null
  let panelCollapsed = false

  const setLabelsVisible = (visible: boolean): void => {
    labelsVisible = visible
    refreshMarkerVisibility()
    if (labelToggleButton) labelToggleButton.textContent = labelsVisible ? '隐藏标签' : '显示标签'
  }

  const setMarkersVisible = (visible: boolean): void => {
    markersVisible = visible
    refreshMarkerVisibility()
    if (markerToggleButton) markerToggleButton.textContent = markersVisible ? '隐藏标记' : '显示标记'
  }

  const setPanelCollapsed = (collapsed: boolean): void => {
    panelCollapsed = collapsed
    body.style.display = panelCollapsed ? 'none' : ''
    collapseButton.textContent = panelCollapsed ? '展开' : '收起'
    host.style.width = panelCollapsed ? 'auto' : 'min(430px, calc(100vw - 32px))'
  }

  const setCamera = (mode: 'top' | 'active'): void => {
    const cam = options.camera
    const box = new THREE.Box3()
    for (const placement of placements) box.expandByPoint(new THREE.Vector3(placement.x, sampleY(placement), placement.z))
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const active = placementFor(activeId)
    if (mode === 'top' || !active) {
      const span = Math.max(size.x, size.z, 22)
      const height = clamp(span * 1.65, 42, 92)
      cam.up.set(0, 1, 0)
      cam.fov = 46
      cam.position.set(center.x + span * 0.12, center.y + height, center.z + height * 0.32)
      cam.lookAt(center.x, center.y + 0.8, center.z)
      cameraControls.target.copy(center)
      setLabelsVisible(false)
    } else {
      const heading = THREE.MathUtils.degToRad(active.headingDeg)
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).normalize()
      const lat = new THREE.Vector3(-forward.z, 0, forward.x).normalize()
      const y = sampleY(active)
      cam.up.set(0, 1, 0)
      cam.fov = 52
      cam.position
        .set(active.x, y + 16, active.z)
        .addScaledVector(forward, -32)
        .addScaledVector(lat, 14)
      cam.lookAt(active.x + forward.x * 6, y + 1.8, active.z + forward.z * 6)
      cameraControls.target.set(active.x, y + 1.6, active.z)
    }
    cam.updateProjectionMatrix()
    cameraControls.update()
    refreshMarkers()
  }

  addButton('俯视', () => setCamera('top'))
  addButton('近看选中', () => setCamera('active'))
  labelToggleButton = addButton('显示标签', () => setLabelsVisible(!labelsVisible))
  markerToggleButton = addButton('隐藏标记', () => setMarkersVisible(!markersVisible))
  addButton('保存', () => {
    writePlacements(options.storageKey, placements)
    showToast('发车格已保存', 1600)
  })
  addButton('复制配置', () => void navigator.clipboard?.writeText(output.textContent ?? ''))
  addButton('重置默认', () => {
    placements = clonePlacements(defaultPlacements)
    activeId = placements.find((item) => item.id === activeId)?.id ?? placements[0]?.id ?? ''
    removeSavedPlacements(options.storageKey)
    for (const placement of placements) options.onPlacementChange(placement)
    refreshMarkers()
    refresh()
    setCamera('top')
    showToast('已重置默认发车格', 1600)
  })
  addButton('开始驾驶', () => {
    options.onStartDriving?.()
    dispose()
  })
  body.appendChild(buttonRow)
  body.appendChild(output)
  document.body.appendChild(host)

  collapseButton.addEventListener('click', () => setPanelCollapsed(!panelCollapsed))

  let panelDragStart: { pointerX: number; pointerY: number; left: number; top: number } | null = null
  titleBar.addEventListener('pointerdown', (ev) => {
    if (ev.target === collapseButton) return
    const rect = host.getBoundingClientRect()
    panelDragStart = { pointerX: ev.clientX, pointerY: ev.clientY, left: rect.left, top: rect.top }
    titleBar.setPointerCapture(ev.pointerId)
    ev.preventDefault()
  })
  titleBar.addEventListener('pointermove', (ev) => {
    if (!panelDragStart) return
    const maxLeft = window.innerWidth - host.offsetWidth - 8
    const maxTop = window.innerHeight - host.offsetHeight - 8
    const left = Math.max(8, Math.min(maxLeft, panelDragStart.left + ev.clientX - panelDragStart.pointerX))
    const top = Math.max(8, Math.min(maxTop, panelDragStart.top + ev.clientY - panelDragStart.pointerY))
    host.style.left = `${left}px`
    host.style.top = `${top}px`
    host.style.right = 'auto'
  })
  titleBar.addEventListener('pointerup', () => {
    panelDragStart = null
  })

  const setPointerFromEvent = (ev: PointerEvent): void => {
    const rect = options.renderer.domElement.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
  }

  const onPointerDown = (ev: PointerEvent): void => {
    if (!markersVisible) return
    setPointerFromEvent(ev)
    raycaster.setFromCamera(pointer, options.camera)
    const hit = raycaster.intersectObjects(hitMeshes, false)[0]
    if (!hit) return
    const id = typeof hit.object.userData.gridPlacementId === 'string' ? hit.object.userData.gridPlacementId : null
    if (!id) return
    draggingId = id
    setActive(id)
    const placement = placementFor(id)
    if (placement) {
      const y = sampleY(placement) + 1.35
      dragPlane.set(new THREE.Vector3(0, 1, 0), -y)
      if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
        dragOffset.set(placement.x - dragPoint.x, 0, placement.z - dragPoint.z)
      } else {
        dragOffset.set(0, 0, 0)
      }
    } else {
      dragOffset.set(0, 0, 0)
    }
    cameraControls.enabled = false
    options.renderer.domElement.setPointerCapture(ev.pointerId)
    options.renderer.domElement.style.cursor = 'grabbing'
    ev.stopImmediatePropagation()
    ev.preventDefault()
  }

  const onPointerMove = (ev: PointerEvent): void => {
    if (!draggingId) return
    setPointerFromEvent(ev)
    raycaster.setFromCamera(pointer, options.camera)
    const placement = placementFor(draggingId)
    if (placement && raycaster.ray.intersectPlane(dragPlane, nextDragPoint)) {
      nextDragPoint.add(dragOffset)
      const dx = nextDragPoint.x - placement.x
      const dz = nextDragPoint.z - placement.z
      const dist = Math.hypot(dx, dz)
      if (dist > MAX_DRAG_STEP) {
        const ratio = MAX_DRAG_STEP / dist
        nextDragPoint.x = placement.x + dx * ratio
        nextDragPoint.z = placement.z + dz * ratio
      }
      applyPlacement(draggingId, { x: nextDragPoint.x, z: nextDragPoint.z })
    }
    ev.stopImmediatePropagation()
    ev.preventDefault()
  }

  const onPointerUp = (ev: PointerEvent): void => {
    if (!draggingId) return
    draggingId = null
    cameraControls.enabled = true
    options.renderer.domElement.releasePointerCapture(ev.pointerId)
    options.renderer.domElement.style.cursor = 'default'
    ev.stopImmediatePropagation()
    ev.preventDefault()
  }

  const onContextMenu = (ev: MouseEvent): void => {
    ev.preventDefault()
  }

  const onKey = (ev: KeyboardEvent): void => {
    if (isTypingTarget(ev.target)) return
    const active = placementFor(activeId)
    if (!active) return
    const moveStep = ev.shiftKey ? fineMoveStep * 0.25 : fineMoveStep
    const angleStep = ev.shiftKey ? fineAngleStep * 0.25 : fineAngleStep
    if (ev.key === 'ArrowLeft' && ev.altKey) applyPlacement(activeId, { headingDeg: active.headingDeg - angleStep })
    else if (ev.key === 'ArrowRight' && ev.altKey) applyPlacement(activeId, { headingDeg: active.headingDeg + angleStep })
    else if (ev.key === 'ArrowLeft') applyPlacement(activeId, { x: active.x - moveStep })
    else if (ev.key === 'ArrowRight') applyPlacement(activeId, { x: active.x + moveStep })
    else if (ev.key === 'ArrowUp') applyPlacement(activeId, { z: active.z - moveStep })
    else if (ev.key === 'ArrowDown') applyPlacement(activeId, { z: active.z + moveStep })
    else return
    ev.preventDefault()
  }

  options.renderer.domElement.addEventListener('pointerdown', onPointerDown, true)
  options.renderer.domElement.addEventListener('pointermove', onPointerMove, true)
  options.renderer.domElement.addEventListener('pointerup', onPointerUp, true)
  options.renderer.domElement.addEventListener('pointercancel', onPointerUp, true)
  options.renderer.domElement.addEventListener('contextmenu', onContextMenu)
  cameraControls.addEventListener('change', refreshMarkers)
  window.addEventListener('keydown', onKey)

  refresh()
  refreshMarkers()
  setCamera('top')
  setLabelsVisible(false)
  setMarkersVisible(true)
  writePlacements(options.storageKey, placements)

  function dispose(): void {
    if (disposed) return
    disposed = true
    options.renderer.domElement.removeEventListener('pointerdown', onPointerDown, true)
    options.renderer.domElement.removeEventListener('pointermove', onPointerMove, true)
    options.renderer.domElement.removeEventListener('pointerup', onPointerUp, true)
    options.renderer.domElement.removeEventListener('pointercancel', onPointerUp, true)
    options.renderer.domElement.removeEventListener('contextmenu', onContextMenu)
    cameraControls.removeEventListener('change', refreshMarkers)
    window.removeEventListener('keydown', onKey)
    cameraControls.dispose()
    host.remove()
    options.scene.remove(root)
    for (const marker of markers.values()) {
      marker.labelTexture.dispose()
      marker.labelMaterial.dispose()
    }
    discGeo.dispose()
    ringGeo.dispose()
    crossGeo.dispose()
    hitGeo.dispose()
    shaftGeo.dispose()
    coneGeo.dispose()
    for (const material of markerMaterials) material.dispose()
  }

  return dispose
}

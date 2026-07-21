import * as THREE from 'three'
import { showToast } from '../utils/error'

export interface CarVisualAxisScale {
  overall: number
  width: number
  height: number
  length: number
}

export interface CarVisualTuning {
  player: CarVisualAxisScale
  opponents: CarVisualAxisScale
}

export interface CarVisualTuningTargets {
  playerGroup: THREE.Object3D
  playerBaseScale: THREE.Vector3
  opponentRoot?: THREE.Group | null
}

export interface CarVisualTuningGuiOptions extends CarVisualTuningTargets {
  camera: THREE.PerspectiveCamera
  storageKey?: string
  onClose?: () => void
}

type TuningTarget = 'all' | 'player' | 'opponents'
type ScaleKey = keyof CarVisualAxisScale

const STORAGE_KEY = 'f1s_car_visual_tuning_v3'
const GUI_PARAMS = ['carVisualGui', 'carSizeGui', 'carScaleGui', 'tuneCars']

const DEFAULT_AXIS_SCALE: CarVisualAxisScale = {
  overall: 0.7,
  width: 1.05,
  height: 1,
  length: 1,
}

const DEFAULT_TUNING: CarVisualTuning = {
  player: { ...DEFAULT_AXIS_SCALE },
  opponents: { ...DEFAULT_AXIS_SCALE },
}

export function isCarVisualTuningGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return GUI_PARAMS.some((param) => params.has(param))
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clampScale(value: number): number {
  return THREE.MathUtils.clamp(value, 0.2, 3)
}

function normalizeAxisScale(value: unknown): CarVisualAxisScale {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    overall: clampScale(finiteNumber(record.overall) ?? DEFAULT_AXIS_SCALE.overall),
    width: clampScale(finiteNumber(record.width) ?? DEFAULT_AXIS_SCALE.width),
    height: clampScale(finiteNumber(record.height) ?? DEFAULT_AXIS_SCALE.height),
    length: clampScale(finiteNumber(record.length) ?? DEFAULT_AXIS_SCALE.length),
  }
}

function normalizeTuning(value: unknown): CarVisualTuning {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    player: normalizeAxisScale(record.player),
    opponents: normalizeAxisScale(record.opponents),
  }
}

export function readSavedCarVisualTuning(storageKey = STORAGE_KEY): CarVisualTuning {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? normalizeTuning(JSON.parse(raw)) : normalizeTuning(DEFAULT_TUNING)
  } catch {
    return normalizeTuning(DEFAULT_TUNING)
  }
}

function writeSavedCarVisualTuning(value: CarVisualTuning, storageKey = STORAGE_KEY): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

function removeSavedCarVisualTuning(storageKey = STORAGE_KEY): void {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    /* noop */
  }
}

function scaleVector(base: THREE.Vector3, value: CarVisualAxisScale): THREE.Vector3 {
  return new THREE.Vector3(
    base.x * value.overall * value.width,
    base.y * value.overall * value.height,
    base.z * value.overall * value.length,
  )
}

export function applyCarVisualTuning(value: CarVisualTuning, targets: CarVisualTuningTargets): void {
  const normalized = normalizeTuning(value)
  targets.playerGroup.scale.copy(scaleVector(targets.playerBaseScale, normalized.player))

  if (targets.opponentRoot) {
    const opponentScale = scaleVector(new THREE.Vector3(1, 1, 1), normalized.opponents)
    for (const child of targets.opponentRoot.children) {
      child.scale.copy(opponentScale)
    }
  }
}

function fmt(value: number): number {
  return Number(value.toFixed(3))
}

function tuningSnippet(value: CarVisualTuning): string {
  return [
    'const CAR_VISUAL_TUNING: CarVisualTuning = {',
    '  player: {',
    `    overall: ${fmt(value.player.overall)}, width: ${fmt(value.player.width)}, height: ${fmt(value.player.height)}, length: ${fmt(value.player.length)},`,
    '  },',
    '  opponents: {',
    `    overall: ${fmt(value.opponents.overall)}, width: ${fmt(value.opponents.width)}, height: ${fmt(value.opponents.height)}, length: ${fmt(value.opponents.length)},`,
    '  },',
    '}',
  ].join('\n')
}

function axisValueForTarget(value: CarVisualTuning, target: TuningTarget, key: ScaleKey): number {
  if (target === 'opponents') return value.opponents[key]
  return value.player[key]
}

export function installCarVisualTuningGui(options: CarVisualTuningGuiOptions): () => void {
  const storageKey = options.storageKey ?? STORAGE_KEY
  let tuning = readSavedCarVisualTuning(storageKey)
  let target: TuningTarget = 'all'
  let disposed = false

  const apply = (persist = true): void => {
    tuning = normalizeTuning(tuning)
    applyCarVisualTuning(tuning, options)
    if (persist) writeSavedCarVisualTuning(tuning, storageKey)
    refresh()
  }

  const host = document.createElement('div')
  host.style.cssText = `
    position:fixed;right:16px;top:16px;z-index:270;
    width:min(390px,calc(100vw - 32px));max-height:calc(100vh - 32px);
    overflow:auto;padding:14px;background:rgba(8,12,20,0.93);color:#fff;
    border:1px solid rgba(255,255,255,0.16);border-radius:8px;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    box-shadow:0 16px 40px rgba(0,0,0,0.38);
  `
  host.addEventListener('pointerdown', (ev) => ev.stopPropagation())

  const title = document.createElement('div')
  title.textContent = '赛车尺寸调参'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px;'
  host.appendChild(title)

  const hint = document.createElement('div')
  hint.textContent = '只改变视觉模型，不改变碰撞和物理；X=宽度，Y=高度，Z=长度。'
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  host.appendChild(hint)

  const targetRow = document.createElement('div')
  targetRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:10px;'
  host.appendChild(targetRow)

  const controls: Array<{ key: ScaleKey; range: HTMLInputElement; number: HTMLInputElement }> = []
  const output = document.createElement('pre')
  output.style.cssText = `
    margin:10px 0 0;padding:10px;border-radius:6px;background:rgba(255,255,255,0.08);
    color:#dff;font-size:11px;white-space:pre-wrap;user-select:text;
  `

  const setTarget = (next: TuningTarget): void => {
    target = next
    refresh()
  }

  const refreshTargetButtons = (): void => {
    targetRow.innerHTML = ''
    const items: Array<[TuningTarget, string]> = [
      ['all', '全部'],
      ['player', '玩家'],
      ['opponents', 'AI'],
    ]
    for (const [id, label] of items) {
      const button = document.createElement('button')
      button.textContent = label
      button.style.cssText = [
        'border-radius:6px',
        `border:1px solid ${target === id ? '#38e8ff' : '#475569'}`,
        `background:${target === id ? 'rgba(56,232,255,0.16)' : '#111827'}`,
        'color:#fff',
        'padding:8px 9px',
        'cursor:pointer',
        'font-weight:800',
      ].join(';')
      button.addEventListener('click', () => setTarget(id))
      targetRow.appendChild(button)
    }
  }

  function refresh(): void {
    refreshTargetButtons()
    for (const control of controls) {
      const value = axisValueForTarget(tuning, target, control.key)
      control.range.value = String(value)
      control.number.value = String(value)
    }
    output.textContent = tuningSnippet(tuning)
  }

  const setScaleValue = (key: ScaleKey, raw: number): void => {
    if (!Number.isFinite(raw)) return
    const value = clampScale(raw)
    if (target === 'all' || target === 'player') tuning.player[key] = value
    if (target === 'all' || target === 'opponents') tuning.opponents[key] = value
    apply()
  }

  const addScaleSlider = (key: ScaleKey, label: string, min: number, max: number, step: number): void => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:70px 1fr 82px;gap:8px;align-items:center;margin:8px 0;'
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
    number.style.cssText = 'width:80px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px;'
    range.addEventListener('input', () => setScaleValue(key, Number(range.value)))
    number.addEventListener('input', () => setScaleValue(key, Number(number.value)))
    controls.push({ key, range, number })
    row.append(text, range, number)
    host.appendChild(row)
  }

  addScaleSlider('overall', '整体', 0.35, 2.2, 0.01)
  addScaleSlider('width', '宽度 X', 0.35, 2.2, 0.01)
  addScaleSlider('height', '高度 Y', 0.35, 2.2, 0.01)
  addScaleSlider('length', '长度 Z', 0.35, 2.2, 0.01)

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;'
  const addButton = (text: string, onClick: () => void): void => {
    const button = document.createElement('button')
    button.textContent = text
    button.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;'
    button.addEventListener('click', onClick)
    buttonRow.appendChild(button)
  }

  addButton('保存', () => {
    writeSavedCarVisualTuning(tuning, storageKey)
    showToast('赛车尺寸已保存', 1600)
  })
  addButton('复制配置', () => void navigator.clipboard?.writeText(output.textContent ?? ''))
  addButton('重置当前', () => {
    if (target === 'all' || target === 'player') tuning.player = { ...DEFAULT_AXIS_SCALE }
    if (target === 'all' || target === 'opponents') tuning.opponents = { ...DEFAULT_AXIS_SCALE }
    apply()
    showToast('已重置当前尺寸', 1400)
  })
  addButton('全部重置', () => {
    tuning = normalizeTuning(DEFAULT_TUNING)
    removeSavedCarVisualTuning(storageKey)
    apply(false)
    showToast('已重置全部赛车尺寸', 1400)
  })
  addButton('近看玩家', () => {
    const p = options.playerGroup.position
    const heading = options.playerGroup.rotation.y
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)).normalize()
    const side = new THREE.Vector3(-forward.z, 0, forward.x)
    options.camera.position.copy(p).addScaledVector(forward, -10).addScaledVector(side, 4)
    options.camera.position.y += 4
    options.camera.lookAt(p.x, p.y + 1.2, p.z)
    options.camera.updateProjectionMatrix()
  })
  addButton('开始驾驶', () => dispose())
  host.appendChild(buttonRow)
  host.appendChild(output)
  document.body.appendChild(host)

  apply(false)

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape') return
    dispose()
  }
  window.addEventListener('keydown', onKey)

  function dispose(): void {
    if (disposed) return
    disposed = true
    window.removeEventListener('keydown', onKey)
    host.remove()
    options.onClose?.()
  }

  return dispose
}

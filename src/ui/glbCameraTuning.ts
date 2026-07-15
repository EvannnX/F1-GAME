import { showToast } from '../utils/error'

export interface GlbCameraTuning {
  backDistance: number
  upDistance: number
  lookAhead: number
  lookUp: number
  fov: number
}

export interface GlbCameraTuningGuiOptions {
  tuning: GlbCameraTuning
  defaults: GlbCameraTuning
  storageKey: string
  onChange: (tuning: GlbCameraTuning) => void
  onClose?: () => void
}

type NumericCameraKey = keyof GlbCameraTuning

const GUI_PARAMS = ['cameraGui', 'cameraTuning', 'cameraEditor', 'tuneCamera']

export function isGlbCameraTuningGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return GUI_PARAMS.some((param) => params.has(param))
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function cloneTuning(value: GlbCameraTuning): GlbCameraTuning {
  return { ...value }
}

function clampTuning(value: GlbCameraTuning): GlbCameraTuning {
  return {
    backDistance: Math.min(16, Math.max(0.5, value.backDistance)),
    upDistance: Math.min(6, Math.max(0.1, value.upDistance)),
    lookAhead: Math.min(60, Math.max(0.5, value.lookAhead)),
    lookUp: Math.min(8, Math.max(-8, value.lookUp)),
    fov: Math.min(100, Math.max(35, value.fov)),
  }
}

function normalizeTuning(value: unknown, defaults: GlbCameraTuning): GlbCameraTuning {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return clampTuning({
    backDistance: finiteNumber(record.backDistance) ?? defaults.backDistance,
    upDistance: finiteNumber(record.upDistance) ?? defaults.upDistance,
    lookAhead: finiteNumber(record.lookAhead) ?? defaults.lookAhead,
    lookUp: finiteNumber(record.lookUp) ?? defaults.lookUp,
    fov: finiteNumber(record.fov) ?? defaults.fov,
  })
}

export function readSavedGlbCameraTuning(storageKey: string, defaults: GlbCameraTuning): GlbCameraTuning {
  try {
    const raw = localStorage.getItem(storageKey)
    return raw ? normalizeTuning(JSON.parse(raw), defaults) : cloneTuning(defaults)
  } catch {
    return cloneTuning(defaults)
  }
}

function writeSavedGlbCameraTuning(storageKey: string, value: GlbCameraTuning): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(clampTuning(value)))
  } catch {
    /* noop */
  }
}

function removeSavedGlbCameraTuning(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey)
  } catch {
    /* noop */
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

function fmt(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

function pitchDeg(value: GlbCameraTuning): number {
  return THREE_RAD_TO_DEG * Math.atan2(value.lookUp - value.upDistance, value.backDistance + value.lookAhead)
}

const THREE_RAD_TO_DEG = 180 / Math.PI

function tuningSnippet(value: GlbCameraTuning): string {
  return [
    `const GLB_THIRD_BACK_DISTANCE = ${fmt(value.backDistance)}`,
    `const GLB_THIRD_UP_DISTANCE = ${fmt(value.upDistance)}`,
    `const GLB_THIRD_LOOK_AHEAD = ${fmt(value.lookAhead)}`,
    `const GLB_THIRD_LOOK_UP = ${fmt(value.lookUp)}`,
    `const GLB_THIRD_FOV = ${fmt(value.fov)}`,
  ].join('\n')
}

export function installGlbCameraTuningGui(options: GlbCameraTuningGuiOptions): () => void {
  let tuning = clampTuning(options.tuning)
  let disposed = false
  const inputs = new Map<NumericCameraKey, HTMLInputElement>()

  const host = document.createElement('div')
  host.style.cssText = `
    position:fixed;left:16px;bottom:16px;z-index:280;
    width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 32px);
    overflow:auto;padding:14px;background:rgba(8,12,20,0.93);color:#fff;
    border:1px solid rgba(255,255,255,0.16);border-radius:8px;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    box-shadow:0 16px 40px rgba(0,0,0,0.38);
  `
  host.addEventListener('pointerdown', (ev) => ev.stopPropagation())

  const title = document.createElement('div')
  title.textContent = 'GLB 相机调参'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:6px;'
  host.appendChild(title)

  const hint = document.createElement('div')
  hint.textContent = 'W/S 高度，A/D 车后距离，↑/↓ 俯仰，←/→ FOV；Shift = 大步进。'
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  host.appendChild(hint)

  const summary = document.createElement('div')
  summary.style.cssText = 'font-size:12px;color:#dff;margin-bottom:10px;'
  host.appendChild(summary)

  const apply = (persist = true): void => {
    tuning = clampTuning(tuning)
    if (persist) writeSavedGlbCameraTuning(options.storageKey, tuning)
    options.onChange(cloneTuning(tuning))
    refresh()
  }

  const addNumberRow = (key: NumericCameraKey, label: string, step: number): void => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:112px 1fr 82px;gap:8px;align-items:center;margin:8px 0;'

    const text = document.createElement('span')
    text.textContent = label
    text.style.cssText = 'font-size:12px;color:#cbd5e1;font-weight:700;'

    const range = document.createElement('input')
    range.type = 'range'
    range.step = String(step)
    range.style.cssText = 'width:100%;'
    if (key === 'fov') {
      range.min = '35'; range.max = '100'
    } else if (key === 'lookUp') {
      range.min = '-8'; range.max = '8'
    } else if (key === 'lookAhead') {
      range.min = '0.5'; range.max = '60'
    } else if (key === 'upDistance') {
      range.min = '0.1'; range.max = '6'
    } else {
      range.min = '0.5'; range.max = '16'
    }

    const input = document.createElement('input')
    input.type = 'number'
    input.step = String(step)
    input.style.cssText = `
      width:100%;box-sizing:border-box;border:1px solid #475569;border-radius:6px;
      background:#0f172a;color:#fff;padding:7px 8px;font:700 12px ui-monospace,SFMono-Regular,Menlo,monospace;
    `
    inputs.set(key, input)

    const setValue = (raw: string): void => {
      const next = Number(raw)
      if (!Number.isFinite(next)) return
      tuning = { ...tuning, [key]: next }
      apply()
    }
    range.addEventListener('input', () => setValue(range.value))
    input.addEventListener('change', () => setValue(input.value))

    row.appendChild(text)
    row.appendChild(range)
    row.appendChild(input)
    host.appendChild(row)
    inputs.set(`${key}Range` as NumericCameraKey, range)
  }

  addNumberRow('backDistance', '车后距离', 0.05)
  addNumberRow('upDistance', '相机高度', 0.05)
  addNumberRow('lookAhead', '前视距离', 0.1)
  addNumberRow('lookUp', '俯仰目标', 0.05)
  addNumberRow('fov', 'FOV', 1)

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;'

  const addButton = (label: string, action: () => void): void => {
    const button = document.createElement('button')
    button.textContent = label
    button.style.cssText = `
      border:1px solid #475569;border-radius:6px;background:#111827;color:#fff;
      padding:9px 8px;cursor:pointer;font-weight:800;
    `
    button.addEventListener('click', action)
    buttonRow.appendChild(button)
  }

  const output = document.createElement('pre')
  output.style.cssText = `
    margin:10px 0 0;padding:10px;border-radius:6px;background:rgba(255,255,255,0.08);
    color:#dff;font-size:11px;white-space:pre-wrap;user-select:text;
  `

  addButton('重置', () => {
    tuning = cloneTuning(options.defaults)
    removeSavedGlbCameraTuning(options.storageKey)
    apply(false)
    showToast('相机参数已重置', 1200)
  })
  addButton('复制', () => {
    void navigator.clipboard?.writeText(tuningSnippet(tuning)).then(
      () => showToast('相机参数已复制', 1200),
      () => showToast('复制失败，请手动选择', 1200),
    )
  })
  addButton('开始驾驶', () => dispose())
  host.appendChild(buttonRow)
  host.appendChild(output)

  function refresh(): void {
    summary.textContent = `向下角度 ${fmt(-pitchDeg(tuning), 2)}° · FOV ${fmt(tuning.fov, 1)}°`
    output.textContent = tuningSnippet(tuning)
    for (const [key, input] of inputs) {
      const plainKey = String(key).replace('Range', '') as NumericCameraKey
      input.value = String(fmt(tuning[plainKey], plainKey === 'fov' ? 1 : 2))
    }
  }

  const nudge = (key: NumericCameraKey, delta: number): void => {
    tuning = { ...tuning, [key]: tuning[key] + delta }
    apply()
  }

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (disposed || isTypingTarget(ev.target)) return
    const scale = ev.shiftKey ? 4 : 1
    let handled = true
    if (ev.key === 'w' || ev.key === 'W') nudge('upDistance', 0.05 * scale)
    else if (ev.key === 's' || ev.key === 'S') nudge('upDistance', -0.05 * scale)
    else if (ev.key === 'a' || ev.key === 'A') nudge('backDistance', -0.1 * scale)
    else if (ev.key === 'd' || ev.key === 'D') nudge('backDistance', 0.1 * scale)
    else if (ev.key === 'ArrowUp') nudge('lookUp', 0.05 * scale)
    else if (ev.key === 'ArrowDown') nudge('lookUp', -0.05 * scale)
    else if (ev.key === 'ArrowLeft') nudge('fov', -1 * scale)
    else if (ev.key === 'ArrowRight') nudge('fov', 1 * scale)
    else handled = false
    if (!handled) return
    ev.preventDefault()
    ev.stopPropagation()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    window.removeEventListener('keydown', onKeyDown, true)
    if (host.parentElement) host.parentElement.removeChild(host)
    options.onClose?.()
  }

  document.body.appendChild(host)
  window.addEventListener('keydown', onKeyDown, true)
  apply(false)
  return dispose
}

import * as THREE from 'three'
import type { SceneBundle } from '../render/scene'
import type { EnvTexturePlacement, TrackBundle } from '../render/track'

const STORAGE_KEY = 'f1s_env_texture_placement'

type NumericEnvKey = Exclude<keyof EnvTexturePlacement, 'flipY'>

export function isTexturePlacementGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('textureGui') || params.has('envGui') || params.has('placeTexture')
}

function readSaved(): Partial<EnvTexturePlacement> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Partial<EnvTexturePlacement> : null
  } catch {
    return null
  }
}

function writeSaved(value: EnvTexturePlacement): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

function fmt(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

function placementSnippet(value: EnvTexturePlacement): string {
  return [
    'const ENV_ALIGNMENT: EnvTexturePlacement = {',
    `  x: ${fmt(value.x)},`,
    `  z: ${fmt(value.z)},`,
    `  y: ${fmt(value.y, 3)},`,
    `  yawDeg: ${fmt(value.yawDeg)},`,
    `  scale: ${fmt(value.scale, 3)},`,
    `  flipY: ${value.flipY},`,
    '}',
  ].join('\n')
}

export function installTexturePlacementGui(
  bundle: SceneBundle,
  track: TrackBundle,
): () => void {
  const saved = readSaved()
  if (saved) track.setEnvTexturePlacement(saved)

  let placement = track.getEnvTexturePlacement()

  const setCamera = (mode: 'top' | 'wide' | 'start'): void => {
    const start = track.getPositionAt(0)
    const tg = track.getTangentAt(0).normalize()
    const lat = new THREE.Vector3(-tg.z, 0, tg.x).normalize()
    const cam = bundle.camera
    cam.fov = mode === 'top' ? 42 : 64
    if (mode === 'top') {
      cam.position.set(0, 1120, 0)
      cam.lookAt(0, 0, 0)
    } else if (mode === 'wide') {
      cam.position.copy(start).addScaledVector(tg, -520).addScaledVector(lat, 330)
      cam.position.y = 310
      cam.lookAt(0, 0, 0)
    } else {
      cam.position.copy(start).addScaledVector(tg, -210).addScaledVector(lat, 42)
      cam.position.y = 78
      cam.lookAt(start.x + tg.x * -26, 18, start.z + tg.z * -26)
    }
    cam.updateProjectionMatrix()
  }

  const host = document.createElement('div')
  host.style.cssText = `
    position: fixed; right: 16px; top: 16px; z-index: 210;
    width: min(372px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    overflow: auto; padding: 14px;
    background: rgba(8,12,20,0.92); color: #fff;
    border: 1px solid rgba(255,255,255,0.16); border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    box-shadow: 0 16px 40px rgba(0,0,0,0.38);
  `

  const title = document.createElement('div')
  title.textContent = '赛道贴图摆放'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px;'
  host.appendChild(title)

  const hint = document.createElement('div')
  hint.textContent = '拖动平面移动贴图，角度和缩放支持小数。Shift + 方向键 = 细调，Alt + 左右 = 旋转。'
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  host.appendChild(hint)

  const output = document.createElement('pre')
  output.style.cssText = `
    margin: 10px 0 0; padding: 10px; border-radius: 6px;
    background: rgba(255,255,255,0.08); color: #dff;
    font-size: 11px; white-space: pre-wrap; user-select: text;
  `

  const controls: Array<{
    key: NumericEnvKey
    input: HTMLInputElement
    number: HTMLInputElement
  }> = []
  let flipInput: HTMLInputElement | null = null

  const refresh = (): void => {
    placement = track.getEnvTexturePlacement()
    for (const c of controls) {
      const value = String(placement[c.key])
      c.input.value = value
      c.number.value = value
    }
    if (flipInput) flipInput.checked = placement.flipY
    output.textContent = placementSnippet(placement)
  }

  const apply = (next: Partial<EnvTexturePlacement>, persist = true): void => {
    track.setEnvTexturePlacement(next)
    placement = track.getEnvTexturePlacement()
    if (persist) writeSaved(placement)
    refresh()
  }

  const addSlider = (
    key: NumericEnvKey,
    label: string,
    min: number,
    max: number,
    step: number,
  ): void => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:78px 1fr 82px;gap:8px;align-items:center;margin:8px 0;'

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
    number.style.cssText = 'width:80px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px;'

    const onInput = (raw: string): void => {
      const value = Number(raw)
      if (Number.isFinite(value)) apply({ [key]: value } as Partial<EnvTexturePlacement>)
    }
    input.addEventListener('input', () => onInput(input.value))
    number.addEventListener('input', () => onInput(number.value))

    controls.push({ key, input, number })
    row.append(text, input, number)
    host.appendChild(row)
  }

  const pad = document.createElement('div')
  pad.style.cssText = `
    height: 188px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;
    background:
      linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px),
      rgba(255,255,255,0.04);
    background-size: 20px 20px;
    display: flex; align-items: center; justify-content: center;
    color: #9fb; font-size: 12px; cursor: grab; user-select: none;
  `
  pad.textContent = '拖动这里: 左右 = x，上下 = z'
  let lastPointer: { x: number; y: number } | null = null
  pad.addEventListener('pointerdown', (ev) => {
    lastPointer = { x: ev.clientX, y: ev.clientY }
    pad.setPointerCapture(ev.pointerId)
    pad.style.cursor = 'grabbing'
  })
  pad.addEventListener('pointermove', (ev) => {
    if (!lastPointer) return
    const dx = ev.clientX - lastPointer.x
    const dy = ev.clientY - lastPointer.y
    lastPointer = { x: ev.clientX, y: ev.clientY }
    apply({
      x: placement.x + dx * 1.5,
      z: placement.z + dy * 1.5,
    })
  })
  pad.addEventListener('pointerup', () => {
    lastPointer = null
    pad.style.cursor = 'grab'
  })
  host.appendChild(pad)

  addSlider('x', 'X', -900, 900, 0.1)
  addSlider('z', 'Z', -700, 700, 0.1)
  addSlider('y', '高度', -4, 4, 0.01)
  addSlider('yawDeg', '角度', -360, 360, 0.1)
  addSlider('scale', '缩放', 0.25, 2.5, 0.001)

  const flipRow = document.createElement('label')
  flipRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin:8px 0;color:#ccd;font-size:12px;'
  flipInput = document.createElement('input')
  flipInput.type = 'checkbox'
  flipInput.addEventListener('change', () => apply({ flipY: flipInput?.checked ?? false }))
  const flipText = document.createElement('span')
  flipText.textContent = '上下翻转贴图'
  flipRow.append(flipInput, flipText)
  host.appendChild(flipRow)

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;'
  const addButton = (text: string, onClick: () => void): void => {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;'
    btn.addEventListener('click', onClick)
    buttonRow.appendChild(btn)
  }
  addButton('俯视全图', () => setCamera('top'))
  addButton('远景', () => setCamera('wide'))
  addButton('发车视角', () => setCamera('start'))
  addButton('复制配置', () => void navigator.clipboard?.writeText(output.textContent ?? ''))
  addButton('清除本机保存', () => {
    localStorage.removeItem(STORAGE_KEY)
    track.setEnvTexturePlacement({
      x: 0,
      z: 0,
      y: -0.06,
      yawDeg: 0,
      scale: 1,
      flipY: false,
    })
    refresh()
  })
  host.appendChild(buttonRow)
  host.appendChild(output)
  document.body.appendChild(host)

  setCamera('top')
  refresh()

  const onKey = (ev: KeyboardEvent): void => {
    const moveStep = ev.shiftKey ? 0.1 : 5
    const angleStep = ev.shiftKey ? 0.1 : 1
    if (ev.key === 'ArrowLeft' && ev.altKey) apply({ yawDeg: placement.yawDeg - angleStep })
    else if (ev.key === 'ArrowRight' && ev.altKey) apply({ yawDeg: placement.yawDeg + angleStep })
    else if (ev.key === 'ArrowLeft') apply({ x: placement.x - moveStep })
    else if (ev.key === 'ArrowRight') apply({ x: placement.x + moveStep })
    else if (ev.key === 'ArrowUp') apply({ z: placement.z - moveStep })
    else if (ev.key === 'ArrowDown') apply({ z: placement.z + moveStep })
    else if (ev.key === '[') apply({ scale: Math.max(0.01, placement.scale - (ev.shiftKey ? 0.001 : 0.01)) })
    else if (ev.key === ']') apply({ scale: placement.scale + (ev.shiftKey ? 0.001 : 0.01) })
    else return
    ev.preventDefault()
  }
  window.addEventListener('keydown', onKey)

  return () => {
    window.removeEventListener('keydown', onKey)
    host.remove()
  }
}

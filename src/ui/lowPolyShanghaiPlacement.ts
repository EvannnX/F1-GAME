import * as THREE from 'three'
import type { SceneBundle } from '../render/scene'
import type { TrackBundle } from '../render/track'
import { AUTOSAVE_CAR_VISUAL_SCALE } from '../render/car'
import {
  LOW_POLY_SHANGHAI_PLACEMENT,
  type LowPolyShanghaiBundle,
  type LowPolyShanghaiPlacement,
} from '../render/lowPolyShanghai'

const STORAGE_KEY = 'f1s_lowpoly_shanghai_placement_v5'

type NumericPlacementKey = keyof LowPolyShanghaiPlacement

export function isLowPolyShanghaiPlacementGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('lowPolyShanghaiGui') || params.has('lowpolyShanghaiGui') || params.has('placeLowPolyShanghai')
}

export function readSavedLowPolyShanghaiPlacement(): Partial<LowPolyShanghaiPlacement> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Partial<LowPolyShanghaiPlacement> : null
  } catch {
    return null
  }
}

function writeSavedLowPolyShanghaiPlacement(value: LowPolyShanghaiPlacement): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

function fmt(value: number, digits = 2): number {
  return Number(value.toFixed(digits))
}

function placementSnippet(value: LowPolyShanghaiPlacement): string {
  return [
    'const LOW_POLY_SHANGHAI_PLACEMENT: LowPolyShanghaiPlacement = {',
    `  x: ${fmt(value.x)},`,
    `  z: ${fmt(value.z)},`,
    `  y: ${fmt(value.y, 3)},`,
    `  yawDeg: ${fmt(value.yawDeg)},`,
    `  scale: ${fmt(value.scale, 4)},`,
    '}',
  ].join('\n')
}

function sampleTrackBox(track: TrackBundle): THREE.Box3 {
  const box = new THREE.Box3()
  for (let i = 0; i < 240; i++) box.expandByPoint(track.getPositionAt(i / 240))
  return box
}

export function installLowPolyShanghaiPlacementGui(
  bundle: SceneBundle,
  track: TrackBundle,
  lowPolyShanghai: LowPolyShanghaiBundle,
): () => void {
  const saved = readSavedLowPolyShanghaiPlacement()
  if (saved) lowPolyShanghai.setPlacement(saved)

  let placement = lowPolyShanghai.getPlacement()
  let modelOpacity = 1

  const setModelOpacity = (opacity: number): void => {
    modelOpacity = Math.max(0.08, Math.min(1, opacity))
    lowPolyShanghai.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const mat of materials) {
        mat.transparent = modelOpacity < 1
        mat.opacity = modelOpacity
        mat.depthWrite = modelOpacity >= 1
        mat.needsUpdate = true
      }
    })
  }

  const setCamera = (mode: 'top' | 'wide' | 'start' | 'race'): void => {
    const trackBox = sampleTrackBox(track)
    const size = trackBox.getSize(new THREE.Vector3())
    const center = trackBox.getCenter(new THREE.Vector3())
    const start = track.getPositionAt(0)
    const tg = track.getTangentAt(0).normalize()
    const lat = new THREE.Vector3(-tg.z, 0, tg.x).normalize()
    const cam = bundle.camera
    cam.fov = mode === 'top' ? 42 : mode === 'race' ? 60 : 64
    if (mode === 'top') {
      const height = Math.max(980, Math.max(size.x, size.z) * 1.42)
      cam.position.set(center.x, height, center.z + 0.1)
      cam.lookAt(center.x, 0, center.z)
    } else if (mode === 'wide') {
      cam.position.copy(start).addScaledVector(tg, -520).addScaledVector(lat, 320)
      cam.position.y = 280
      cam.lookAt(center.x, 0, center.z)
    } else if (mode === 'race') {
      const carP = start.clone().addScaledVector(lat, track.gridPoleLateral)
      const back = new THREE.Vector3(-tg.x, 0, -tg.z)
      cam.position
        .copy(carP)
        .addScaledVector(back, 4.5 * AUTOSAVE_CAR_VISUAL_SCALE)
        .add(new THREE.Vector3(0, 2.2 * AUTOSAVE_CAR_VISUAL_SCALE, 0))
      const look = carP.clone().addScaledVector(tg, 6 * AUTOSAVE_CAR_VISUAL_SCALE)
      look.y += 0.6 * AUTOSAVE_CAR_VISUAL_SCALE
      cam.lookAt(look)
    } else {
      cam.position.copy(start).addScaledVector(tg, -210).addScaledVector(lat, 42)
      cam.position.y = 78
      cam.lookAt(start.x + tg.x * -26, 18, start.z + tg.z * -26)
    }
    cam.updateProjectionMatrix()
  }

  const host = document.createElement('div')
  host.style.cssText = `
    position: fixed; right: 16px; top: 16px; z-index: 245;
    width: min(390px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    overflow: auto; padding: 14px;
    background: rgba(8,12,20,0.92); color: #fff;
    border: 1px solid rgba(255,255,255,0.16); border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    box-shadow: 0 16px 40px rgba(0,0,0,0.38);
  `

  const title = document.createElement('div')
  title.textContent = '上海赛车场压缩模型摆放'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px;'
  host.appendChild(title)

  const hint = document.createElement('div')
  hint.textContent = '拖动平面移动模型；赛车视角按钮会切到当前发车位的追车视角。Shift + 方向键 = 细调，Alt + 左右 = 旋转。'
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  host.appendChild(hint)

  const output = document.createElement('pre')
  output.style.cssText = `
    margin: 10px 0 0; padding: 10px; border-radius: 6px;
    background: rgba(255,255,255,0.08); color: #dff;
    font-size: 11px; white-space: pre-wrap; user-select: text;
  `

  const controls: Array<{
    key: NumericPlacementKey
    input: HTMLInputElement
    number: HTMLInputElement
  }> = []
  let opacityInput: HTMLInputElement | null = null
  let opacityNumber: HTMLInputElement | null = null

  const refresh = (): void => {
    placement = lowPolyShanghai.getPlacement()
    for (const c of controls) {
      const value = String(placement[c.key])
      c.input.value = value
      c.number.value = value
    }
    if (opacityInput && opacityNumber) {
      opacityInput.value = String(modelOpacity)
      opacityNumber.value = String(modelOpacity)
    }
    output.textContent = placementSnippet(placement)
  }

  const apply = (next: Partial<LowPolyShanghaiPlacement>, persist = true): void => {
    lowPolyShanghai.setPlacement(next)
    placement = lowPolyShanghai.getPlacement()
    if (persist) writeSavedLowPolyShanghaiPlacement(placement)
    refresh()
  }

  const addSlider = (
    key: NumericPlacementKey,
    label: string,
    min: number,
    max: number,
    step: number,
  ): void => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:78px 1fr 86px;gap:8px;align-items:center;margin:8px 0;'

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
    number.style.cssText = 'width:84px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px;'

    const onInput = (raw: string): void => {
      const value = Number(raw)
      if (Number.isFinite(value)) apply({ [key]: value } as Partial<LowPolyShanghaiPlacement>)
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

  addSlider('x', 'X', -2400, 2400, 0.1)
  addSlider('z', 'Z', -2400, 2400, 0.1)
  addSlider('y', '高度', -400, 400, 0.01)
  addSlider('yawDeg', '角度', -360, 360, 0.1)
  addSlider('scale', '缩放', 0.01, 20, 0.001)

  const opacityRow = document.createElement('label')
  opacityRow.style.cssText = 'display:grid;grid-template-columns:78px 1fr 86px;gap:8px;align-items:center;margin:8px 0;'
  const opacityText = document.createElement('span')
  opacityText.textContent = '模型透明'
  opacityText.style.cssText = 'font-size:12px;color:#ccd;'
  opacityInput = document.createElement('input')
  opacityInput.type = 'range'
  opacityInput.min = '0.08'
  opacityInput.max = '1'
  opacityInput.step = '0.01'
  opacityNumber = document.createElement('input')
  opacityNumber.type = 'number'
  opacityNumber.min = '0.08'
  opacityNumber.max = '1'
  opacityNumber.step = '0.01'
  opacityNumber.style.cssText = 'width:84px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px;'
  const onOpacity = (raw: string): void => {
    const value = Number(raw)
    if (Number.isFinite(value)) {
      setModelOpacity(value)
      refresh()
    }
  }
  opacityInput.addEventListener('input', () => onOpacity(opacityInput?.value ?? '1'))
  opacityNumber.addEventListener('input', () => onOpacity(opacityNumber?.value ?? '1'))
  opacityRow.append(opacityText, opacityInput, opacityNumber)
  host.appendChild(opacityRow)

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;'
  const addButton = (text: string, onClick: () => void): void => {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;'
    btn.addEventListener('click', onClick)
    buttonRow.appendChild(btn)
  }
  addButton('赛车视角', () => setCamera('race'))
  addButton('发车视角', () => setCamera('start'))
  addButton('俯视全图', () => setCamera('top'))
  addButton('远景', () => setCamera('wide'))
  addButton('复制配置', () => void navigator.clipboard?.writeText(output.textContent ?? ''))
  addButton('重置模型', () => {
    localStorage.removeItem(STORAGE_KEY)
    lowPolyShanghai.setPlacement(LOW_POLY_SHANGHAI_PLACEMENT)
    setModelOpacity(1)
    refresh()
  })
  host.appendChild(buttonRow)
  host.appendChild(output)
  document.body.appendChild(host)

  setCamera('top')
  lowPolyShanghai.ready.then(() => {
    setModelOpacity(modelOpacity)
    setCamera('top')
  }).catch(() => undefined)
  refresh()

  const onKey = (ev: KeyboardEvent): void => {
    const moveStep = ev.shiftKey ? 0.1 : 5
    const heightStep = ev.shiftKey ? 0.01 : 0.5
    const angleStep = ev.shiftKey ? 0.1 : 1
    if (ev.key === 'ArrowLeft' && ev.altKey) apply({ yawDeg: placement.yawDeg - angleStep })
    else if (ev.key === 'ArrowRight' && ev.altKey) apply({ yawDeg: placement.yawDeg + angleStep })
    else if (ev.key === 'ArrowLeft') apply({ x: placement.x - moveStep })
    else if (ev.key === 'ArrowRight') apply({ x: placement.x + moveStep })
    else if (ev.key === 'ArrowUp' && ev.altKey) apply({ y: placement.y + heightStep })
    else if (ev.key === 'ArrowDown' && ev.altKey) apply({ y: placement.y - heightStep })
    else if (ev.key === 'ArrowUp') apply({ z: placement.z - moveStep })
    else if (ev.key === 'ArrowDown') apply({ z: placement.z + moveStep })
    else return
    ev.preventDefault()
  }
  window.addEventListener('keydown', onKey)

  return () => {
    window.removeEventListener('keydown', onKey)
    host.remove()
  }
}

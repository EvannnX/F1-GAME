import * as THREE from 'three'
import type { SceneBundle } from '../render/scene'
import type { StartGrandstandPlacement, TrackBundle } from '../render/track'

const STORAGE_KEY = 'f1s_start_grandstand_placement'

export function isGrandstandPlacementGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('grandstandGui') || params.has('placeGrandstand')
}

function readSaved(): Partial<StartGrandstandPlacement> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Partial<StartGrandstandPlacement> : null
  } catch {
    return null
  }
}

function writeSaved(value: StartGrandstandPlacement): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* noop */
  }
}

function placementSnippet(value: StartGrandstandPlacement): string {
  return [
    'const START_GRANDSTAND_CONFIG: StartGrandstandPlacement = {',
    `  along: ${Number(value.along.toFixed(2))},`,
    `  lateral: ${Number(value.lateral.toFixed(2))},`,
    `  targetLength: ${Number(value.targetLength.toFixed(2))},`,
    `  clockwiseYawDeg: ${Number(value.clockwiseYawDeg.toFixed(2))},`,
    `  y: ${Number(value.y.toFixed(2))},`,
    '}',
  ].join('\n')
}

export function installGrandstandPlacementGui(
  bundle: SceneBundle,
  track: TrackBundle,
): () => void {
  const saved = readSaved()
  if (saved) track.setStartGrandstandPlacement(saved)

  let placement = track.getStartGrandstandPlacement()

  const setCamera = (mode: 'start' | 'side' | 'top' | 'wide'): void => {
    const start = track.getPositionAt(0)
    const tg = track.getTangentAt(0).normalize()
    const lat = new THREE.Vector3(-tg.z, 0, tg.x).normalize()
    const cam = bundle.camera
    cam.fov = mode === 'top' ? 36 : 68
    if (mode === 'top') {
      cam.position.copy(start).add(new THREE.Vector3(0, 520, 0)).addScaledVector(lat, 18).addScaledVector(tg, -20)
      cam.lookAt(start.x, 0, start.z)
    } else if (mode === 'wide') {
      cam.position.copy(start).addScaledVector(tg, -250).addScaledVector(lat, 95)
      cam.position.y = 85
      cam.lookAt(start.x + tg.x * -12, 24, start.z + tg.z * -12)
    } else if (mode === 'side') {
      cam.position.copy(start).addScaledVector(lat, -300).addScaledVector(tg, -35)
      cam.position.y = 95
      cam.lookAt(start.x + tg.x * -20, 26, start.z + tg.z * -20)
    } else {
      cam.position.copy(start).addScaledVector(tg, -185).addScaledVector(lat, 28)
      cam.position.y = 58
      cam.lookAt(start.x + tg.x * -18, 18, start.z + tg.z * -18)
    }
    cam.updateProjectionMatrix()
  }

  const host = document.createElement('div')
  host.style.cssText = `
    position: fixed; right: 16px; top: 16px; z-index: 200;
    width: min(360px, calc(100vw - 32px)); max-height: calc(100vh - 32px);
    overflow: auto; padding: 14px;
    background: rgba(8,12,20,0.9); color: #fff;
    border: 1px solid rgba(255,255,255,0.16); border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    box-shadow: 0 16px 40px rgba(0,0,0,0.38);
  `

  const title = document.createElement('div')
  title.textContent = '出发区看台摆放'
  title.style.cssText = 'font-size:16px;font-weight:800;letter-spacing:1px;margin-bottom:4px;'
  host.appendChild(title)

  const hint = document.createElement('div')
  hint.textContent = '拖动下方平面移动模型，角度支持小数微调。Shift + 方向键 = 细调。'
  hint.style.cssText = 'font-size:12px;color:#aab;line-height:1.5;margin-bottom:10px;'
  host.appendChild(hint)

  const output = document.createElement('pre')
  output.style.cssText = `
    margin: 10px 0 0; padding: 10px; border-radius: 6px;
    background: rgba(255,255,255,0.08); color: #dff;
    font-size: 11px; white-space: pre-wrap; user-select: text;
  `

  const controls: Array<{
    key: keyof StartGrandstandPlacement
    input: HTMLInputElement
    number: HTMLInputElement
  }> = []

  const refresh = (): void => {
    placement = track.getStartGrandstandPlacement()
    for (const c of controls) {
      const value = String(placement[c.key])
      c.input.value = value
      c.number.value = value
    }
    output.textContent = placementSnippet(placement)
  }

  const apply = (next: Partial<StartGrandstandPlacement>, persist = true): void => {
    track.setStartGrandstandPlacement(next)
    placement = track.getStartGrandstandPlacement()
    if (persist) writeSaved(placement)
    refresh()
  }

  const addSlider = (
    key: keyof StartGrandstandPlacement,
    label: string,
    min: number,
    max: number,
    step: number,
  ): void => {
    const row = document.createElement('label')
    row.style.cssText = 'display:grid;grid-template-columns:92px 1fr 74px;gap:8px;align-items:center;margin:8px 0;'

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
    number.style.cssText = 'width:72px;background:#111827;color:#fff;border:1px solid #334155;border-radius:4px;padding:4px;'

    const onInput = (raw: string): void => {
      const value = Number(raw)
      if (Number.isFinite(value)) apply({ [key]: value } as Partial<StartGrandstandPlacement>)
    }
    input.addEventListener('input', () => onInput(input.value))
    number.addEventListener('input', () => onInput(number.value))

    controls.push({ key, input, number })
    row.append(text, input, number)
    host.appendChild(row)
  }

  const pad = document.createElement('div')
  pad.style.cssText = `
    height: 150px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;
    background:
      linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px),
      rgba(255,255,255,0.04);
    background-size: 20px 20px;
    display: flex; align-items: center; justify-content: center;
    color: #9fb; font-size: 12px; cursor: grab; user-select: none;
  `
  pad.textContent = '拖动这里: 左右 = lateral，上下 = along'
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
      lateral: placement.lateral + dx * 0.5,
      along: placement.along - dy * 0.5,
    })
  })
  pad.addEventListener('pointerup', () => {
    lastPointer = null
    pad.style.cursor = 'grab'
  })
  host.appendChild(pad)

  addSlider('along', '沿赛道', -320, 320, 0.1)
  addSlider('lateral', '横向', -280, 280, 0.1)
  addSlider('y', '高度', -40, 100, 0.1)
  addSlider('targetLength', '长度', 80, 760, 0.5)
  addSlider('clockwiseYawDeg', '顺时针角', -360, 360, 0.1)

  const buttonRow = document.createElement('div')
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;'
  const addButton = (text: string, onClick: () => void): void => {
    const btn = document.createElement('button')
    btn.textContent = text
    btn.style.cssText = 'border:1px solid #475569;background:#111827;color:#fff;border-radius:6px;padding:7px 9px;cursor:pointer;'
    btn.addEventListener('click', onClick)
    buttonRow.appendChild(btn)
  }
  addButton('发车视角', () => setCamera('start'))
  addButton('远景', () => setCamera('wide'))
  addButton('侧面视角', () => setCamera('side'))
  addButton('俯视', () => setCamera('top'))
  addButton('复制配置', () => void navigator.clipboard?.writeText(output.textContent ?? ''))
  addButton('清除本机保存', () => {
    localStorage.removeItem(STORAGE_KEY)
    refresh()
  })
  host.appendChild(buttonRow)
  host.appendChild(output)
  document.body.appendChild(host)

  setCamera('start')
  refresh()

  const onKey = (ev: KeyboardEvent): void => {
    const step = ev.shiftKey ? 0.1 : 2
    const angleStep = ev.shiftKey ? 0.1 : 1
    if (ev.key === 'ArrowLeft' && ev.altKey) apply({ clockwiseYawDeg: placement.clockwiseYawDeg - angleStep })
    else if (ev.key === 'ArrowRight' && ev.altKey) apply({ clockwiseYawDeg: placement.clockwiseYawDeg + angleStep })
    else if (ev.key === 'ArrowLeft') apply({ lateral: placement.lateral - step })
    else if (ev.key === 'ArrowRight') apply({ lateral: placement.lateral + step })
    else if (ev.key === 'ArrowUp') apply({ along: placement.along + step })
    else if (ev.key === 'ArrowDown') apply({ along: placement.along - step })
    else return
    ev.preventDefault()
  }
  window.addEventListener('keydown', onKey)

  return () => {
    window.removeEventListener('keydown', onKey)
    host.remove()
  }
}

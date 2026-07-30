import { clamp } from '../utils/math'
export type MobileControlMode = 'gyro' | 'touch' | 'joystick'
export interface MobileControls {
  getSteer: () => number
  getThrottle: () => number
  getBrake: () => number
  setVisible: (visible: boolean) => void
  destroy: () => void
}
const STYLE_ID = 'f1s-mobile-driving-controls-style'
function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-mobile-controls {
      position: fixed;
      inset: 0;
      z-index: 63;
      display: none;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    .f1s-mobile-controls.is-visible { display: block; }
    body.f1s-mobile-controls-visible .f1s-hud__speed {
      right: max(238px, calc(env(safe-area-inset-right) + 232px)) !important;
    }
    .f1s-mobile-controls__pedal,
    .f1s-mobile-controls__steer,
    .f1s-mobile-controls__joystick {
      position: absolute;
      pointer-events: auto;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    }
    .f1s-mobile-controls__pedal {
      bottom: max(18px, env(safe-area-inset-bottom));
      width: clamp(62px, 8vw, 88px);
      height: clamp(112px, 20vh, 168px);
      border: 2px solid rgba(255,255,255,.34);
      border-radius: 17px;
      background:
        repeating-linear-gradient(90deg, transparent 0 12px, rgba(255,255,255,.22) 12px 17px),
        linear-gradient(180deg, rgba(57,63,74,.68), rgba(21,24,30,.82));
      color: #fff;
      box-shadow: 0 8px 24px rgba(0,0,0,.34), inset 0 2px 4px rgba(255,255,255,.16);
      backdrop-filter: blur(7px);
      -webkit-backdrop-filter: blur(7px);
      transition: transform .08s ease, background .08s ease, border-color .08s ease;
    }
    .f1s-mobile-controls__pedal::after {
      content: attr(data-label);
      position: absolute;
      left: 50%;
      bottom: 9px;
      transform: translateX(-50%);
      padding: 3px 7px;
      border-radius: 8px;
      background: rgba(0,0,0,.48);
      font: 800 10px/1 Inter, sans-serif;
      letter-spacing: .08em;
    }
    .f1s-mobile-controls__pedal.is-active {
      transform: translateY(4px) scale(.96);
      border-color: rgba(255,255,255,.82);
      background:
        repeating-linear-gradient(90deg, transparent 0 12px, rgba(255,255,255,.3) 12px 17px),
        linear-gradient(180deg, rgba(234,42,50,.88), rgba(141,7,17,.92));
    }
    .f1s-mobile-controls__brake { left: max(20px, env(safe-area-inset-left)); }
    .f1s-mobile-controls__throttle { right: max(20px, env(safe-area-inset-right)); }
    .f1s-mobile-controls__steering {
      position: absolute;
      left: max(22px, env(safe-area-inset-left));
      bottom: max(30px, env(safe-area-inset-bottom));
      display: flex;
      gap: clamp(12px, 2.2vw, 28px);
      pointer-events: none;
    }
    .f1s-mobile-controls__steer {
      position: relative;
      width: clamp(72px, 9vw, 104px);
      height: clamp(72px, 9vw, 104px);
      border: 2px solid rgba(255,255,255,.38);
      border-radius: 50%;
      background: rgba(20,24,31,.62);
      color: #fff;
      box-shadow: 0 7px 22px rgba(0,0,0,.3), inset 0 2px 8px rgba(255,255,255,.13);
      backdrop-filter: blur(7px);
      -webkit-backdrop-filter: blur(7px);
      font: 900 clamp(30px, 4vw, 48px)/1 Inter, sans-serif;
    }
    .f1s-mobile-controls__steer.is-active {
      transform: scale(.93);
      background: rgba(212,18,34,.86);
      border-color: rgba(255,255,255,.85);
    }
    .f1s-mobile-controls__joystick {
      left: max(24px, env(safe-area-inset-left));
      bottom: max(24px, env(safe-area-inset-bottom));
      width: clamp(132px, 18vw, 190px);
      height: clamp(132px, 18vw, 190px);
      border: 2px solid rgba(255,255,255,.28);
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,.14), rgba(15,20,28,.48) 68%);
      box-shadow: inset 0 0 24px rgba(255,255,255,.1), 0 8px 24px rgba(0,0,0,.28);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
    }
    .f1s-mobile-controls__joystick-knob {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 46%;
      height: 46%;
      border: 2px solid rgba(255,255,255,.56);
      border-radius: 50%;
      background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.42), rgba(61,72,88,.82));
      box-shadow: 0 7px 18px rgba(0,0,0,.38);
      transform: translate(-50%, -50%);
    }
    .f1s-mobile-controls--touch .f1s-mobile-controls__pedal {
      right: max(20px, env(safe-area-inset-right));
    }
    .f1s-mobile-controls--touch .f1s-mobile-controls__brake {
      left: auto;
      right: max(124px, calc(env(safe-area-inset-right) + 120px));
      height: clamp(88px, 15vh, 126px);
    }
    .f1s-mobile-controls--joystick .f1s-mobile-controls__brake {
      left: auto;
      right: max(124px, calc(env(safe-area-inset-right) + 120px));
      height: clamp(88px, 15vh, 126px);
    }
    @media (max-height: 520px) {
      .f1s-mobile-controls__pedal { height: min(132px, 30vh); }
    }
  `
  document.head.appendChild(style)
}
function createButton(className: string, label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('aria-label', label)
  return button
}
export function createMobileControls(mode: MobileControlMode): MobileControls {
  installStyles()
  const root = document.createElement('div')
  root.className = `f1s-mobile-controls f1s-mobile-controls--${mode}`
  let steer = 0
  let throttle = 0
  let brake = 0
  const cleanups: Array<() => void> = []
  const bindHold = (button: HTMLButtonElement, onValue: (value: number) => void): void => {
    const pointers = new Set<number>()
    const refresh = (): void => {
      const active = pointers.size > 0
      button.classList.toggle('is-active', active)
      onValue(active ? 1 : 0)
    }
    const down = (event: PointerEvent): void => {
      pointers.add(event.pointerId)
      try {
        button.setPointerCapture(event.pointerId)
      } catch {
        /* synthetic pointer events may not own capture */
      }
      refresh()
      event.preventDefault()
      event.stopPropagation()
    }
    const up = (event: PointerEvent): void => {
      pointers.delete(event.pointerId)
      refresh()
      event.preventDefault()
      event.stopPropagation()
    }
    button.addEventListener('pointerdown', down)
    button.addEventListener('pointerup', up)
    button.addEventListener('pointercancel', up)
    button.addEventListener('lostpointercapture', up)
    cleanups.push(() => {
      button.removeEventListener('pointerdown', down)
      button.removeEventListener('pointerup', up)
      button.removeEventListener('pointercancel', up)
      button.removeEventListener('lostpointercapture', up)
    })
  }
  const brakePedal = createButton(
    'f1s-mobile-controls__pedal f1s-mobile-controls__brake',
    '刹车',
  )
  brakePedal.dataset.label = '刹车'
  bindHold(brakePedal, (value) => { brake = value })
  const throttlePedal = createButton(
    'f1s-mobile-controls__pedal f1s-mobile-controls__throttle',
    '油门',
  )
  throttlePedal.dataset.label = '油门'
  bindHold(throttlePedal, (value) => { throttle = value })
  root.append(brakePedal, throttlePedal)
  if (mode === 'touch') {
    const steering = document.createElement('div')
    steering.className = 'f1s-mobile-controls__steering'
    const left = createButton('f1s-mobile-controls__steer', '向左转向')
    const right = createButton('f1s-mobile-controls__steer', '向右转向')
    left.textContent = '‹'
    right.textContent = '›'
    let leftHeld = 0
    let rightHeld = 0
    const refreshSteer = (): void => { steer = rightHeld - leftHeld }
    bindHold(left, (value) => { leftHeld = value; refreshSteer() })
    bindHold(right, (value) => { rightHeld = value; refreshSteer() })
    steering.append(left, right)
    root.appendChild(steering)
  }
  if (mode === 'joystick') {
    const joystick = document.createElement('div')
    joystick.className = 'f1s-mobile-controls__joystick'
    joystick.setAttribute('role', 'slider')
    joystick.setAttribute('aria-label', '转向摇杆')
    joystick.setAttribute('aria-valuemin', '-1')
    joystick.setAttribute('aria-valuemax', '1')
    const knob = document.createElement('div')
    knob.className = 'f1s-mobile-controls__joystick-knob'
    joystick.appendChild(knob)
    let pointerId: number | null = null
    const updateStick = (event: PointerEvent): void => {
      const rect = joystick.getBoundingClientRect()
      const radius = rect.width * 0.3
      const dx = clamp(event.clientX - (rect.left + rect.width / 2), -radius, radius)
      const dy = clamp(event.clientY - (rect.top + rect.height / 2), -radius, radius)
      steer = clamp(dx / radius, -1, 1)
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
      joystick.setAttribute('aria-valuenow', steer.toFixed(2))
    }
    const resetStick = (): void => {
      pointerId = null
      steer = 0
      knob.style.transform = 'translate(-50%, -50%)'
      joystick.setAttribute('aria-valuenow', '0')
    }
    const down = (event: PointerEvent): void => {
      pointerId = event.pointerId
      try {
        joystick.setPointerCapture(event.pointerId)
      } catch {
        /* synthetic pointer events may not own capture */
      }
      updateStick(event)
      event.preventDefault()
      event.stopPropagation()
    }
    const move = (event: PointerEvent): void => {
      if (pointerId !== event.pointerId) return
      updateStick(event)
      event.preventDefault()
      event.stopPropagation()
    }
    const up = (event: PointerEvent): void => {
      if (pointerId !== event.pointerId) return
      resetStick()
      event.preventDefault()
      event.stopPropagation()
    }
    joystick.addEventListener('pointerdown', down)
    joystick.addEventListener('pointermove', move)
    joystick.addEventListener('pointerup', up)
    joystick.addEventListener('pointercancel', up)
    joystick.addEventListener('lostpointercapture', up)
    cleanups.push(() => {
      joystick.removeEventListener('pointerdown', down)
      joystick.removeEventListener('pointermove', move)
      joystick.removeEventListener('pointerup', up)
      joystick.removeEventListener('pointercancel', up)
      joystick.removeEventListener('lostpointercapture', up)
    })
    root.appendChild(joystick)
  }
  document.body.appendChild(root)
  return {
    getSteer: () => steer,
    getThrottle: () => throttle,
    getBrake: () => brake,
    setVisible: (visible) => {
      root.classList.toggle('is-visible', visible)
      document.body.classList.toggle('f1s-mobile-controls-visible', visible)
    },
    destroy: () => {
      for (const cleanup of cleanups) cleanup()
      document.body.classList.remove('f1s-mobile-controls-visible')
      root.remove()
    },
  }
}

import { replaceWithStaticMarkup } from '../utils/staticMarkup'

export type RaceCameraView = 'chase' | 'chaseFar' | 'rearWing' | 'sidepod' | 'cockpit'

export interface RaceCameraSwitcher {
  show: () => void
  hide: () => void
  setView: (view: RaceCameraView) => void
  getView: () => RaceCameraView
  dispose: () => void
}

interface RaceCameraSwitcherOptions {
  initialView?: RaceCameraView
  onChange: (view: RaceCameraView) => void
}

const VIEWS: Array<{
  id: RaceCameraView
  label: string
  detail: string
  key: string
}> = [
  { id: 'chase', label: '近距追尾', detail: '标准', key: '1' },
  { id: 'chaseFar', label: '远距追尾', detail: '全车', key: '2' },
  { id: 'rearWing', label: '尾翼视角', detail: '低机位', key: '3' },
  { id: 'sidepod', label: '车侧视角', detail: '侧箱低机位', key: '4' },
  { id: 'cockpit', label: '座舱视角', detail: '第一视角', key: '5' },
]

const STYLE_ID = 'f1s-race-camera-switcher-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-camera-switcher {
      position: fixed;
      top: max(14px, env(safe-area-inset-top));
      right: max(18px, env(safe-area-inset-right));
      z-index: 64;
      display: none;
      flex-direction: column;
      align-items: flex-end;
      gap: 7px;
      pointer-events: none;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }
    .f1s-camera-switcher__button {
      position: relative;
      width: clamp(48px, 5.6vw, 62px);
      height: clamp(42px, 4.8vw, 54px);
      padding: 0;
      border: 1px solid rgba(255,255,255,.62);
      border-radius: 13px;
      background: linear-gradient(145deg, rgba(15,18,24,.9), rgba(35,39,47,.72));
      color: #fff;
      box-shadow: 0 7px 20px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.2);
      backdrop-filter: blur(9px);
      -webkit-backdrop-filter: blur(9px);
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
      transition: transform .12s ease, background .15s ease;
    }
    .f1s-camera-switcher__button:active {
      transform: scale(.93);
      background: rgba(218,18,34,.92);
    }
    .f1s-camera-switcher__button svg {
      width: 29px;
      height: 29px;
      vertical-align: middle;
      filter: drop-shadow(0 2px 3px rgba(0,0,0,.45));
    }
    .f1s-camera-switcher__index {
      position: absolute;
      right: -5px;
      top: -6px;
      min-width: 18px;
      height: 18px;
      padding: 0 3px;
      border-radius: 10px;
      background: #d41222;
      color: #fff;
      font: 800 10px/18px Inter, sans-serif;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.36);
    }
    .f1s-camera-switcher__label {
      padding: 6px 10px 5px;
      border: 1px solid rgba(255,255,255,.24);
      border-radius: 7px;
      background: rgba(7,9,13,.7);
      color: rgba(255,255,255,.96);
      font-size: clamp(11px, 1.15vw, 13px);
      font-weight: 800;
      line-height: 1;
      letter-spacing: .03em;
      text-shadow: 0 2px 5px rgba(0,0,0,.75);
      box-shadow: 0 4px 12px rgba(0,0,0,.22);
      backdrop-filter: blur(7px);
      -webkit-backdrop-filter: blur(7px);
      pointer-events: none;
      transition: transform .16s ease, background .16s ease;
    }
    .f1s-camera-switcher__label.is-changing {
      transform: translateY(2px) scale(1.04);
      background: rgba(212,18,34,.88);
    }
    @media (max-height: 520px) {
      .f1s-camera-switcher {
        top: max(8px, env(safe-area-inset-top));
      }
      .f1s-camera-switcher__label {
        padding: 5px 8px 4px;
      }
    }
  `
  document.head.appendChild(style)
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
}

export function createRaceCameraSwitcher(options: RaceCameraSwitcherOptions): RaceCameraSwitcher {
  installStyles()
  const host = document.createElement('div')
  host.className = 'f1s-camera-switcher'

  const button = document.createElement('button')
  button.className = 'f1s-camera-switcher__button'
  button.type = 'button'
  replaceWithStaticMarkup(button, `
    <svg viewBox="0 0 36 30" aria-hidden="true">
      <path fill="currentColor" d="M4 5h7l2.4-3h8.2L24 5h3.5A4.5 4.5 0 0 1 32 9.5v14A4.5 4.5 0 0 1 27.5 28h-23A4.5 4.5 0 0 1 0 23.5v-14A4.5 4.5 0 0 1 4.5 5H4Zm12 5.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6Zm0 3.1a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4ZM27 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>
    </svg>
  `)
  const index = document.createElement('span')
  index.className = 'f1s-camera-switcher__index'
  button.appendChild(index)

  const label = document.createElement('div')
  label.className = 'f1s-camera-switcher__label'
  host.append(button, label)
  document.body.appendChild(host)

  let visible = false
  let currentView = options.initialView ?? 'chase'
  let labelTimer = 0

  const refresh = (): void => {
    const viewIndex = Math.max(0, VIEWS.findIndex((item) => item.id === currentView))
    const view = VIEWS[viewIndex]
    index.textContent = `${viewIndex + 1}/${VIEWS.length}`
    label.textContent = `${view.label} · ${view.detail}`
    button.title = `切换视角（V / 1–5）· 当前：${view.label}`
    button.setAttribute('aria-label', `切换视角，当前${view.label}`)
  }

  const pulseLabel = (): void => {
    label.classList.add('is-changing')
    window.clearTimeout(labelTimer)
    labelTimer = window.setTimeout(() => label.classList.remove('is-changing'), 360)
  }

  const selectView = (view: RaceCameraView, notify: boolean): void => {
    currentView = view
    refresh()
    if (!notify) return
    pulseLabel()
    options.onChange(view)
  }

  const cycle = (): void => {
    const currentIndex = Math.max(0, VIEWS.findIndex((item) => item.id === currentView))
    selectView(VIEWS[(currentIndex + 1) % VIEWS.length].id, true)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!visible || event.repeat || isTypingTarget(event.target)) return
    if (event.key === 'v' || event.key === 'V' || event.key === 'c' || event.key === 'C') {
      cycle()
      event.preventDefault()
      return
    }
    const directView = VIEWS.find((item) => item.key === event.key)
    if (!directView) return
    selectView(directView.id, true)
    event.preventDefault()
  }

  button.addEventListener('click', cycle)
  host.addEventListener('pointerdown', (event) => event.stopPropagation())
  host.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true })
  host.addEventListener('touchmove', (event) => event.stopPropagation(), { passive: true })
  host.addEventListener('touchend', (event) => event.stopPropagation(), { passive: true })
  window.addEventListener('keydown', onKeyDown)
  refresh()

  return {
    show: () => {
      visible = true
      host.style.display = 'flex'
    },
    hide: () => {
      visible = false
      host.style.display = 'none'
    },
    setView: (view) => selectView(view, false),
    getView: () => currentView,
    dispose: () => {
      window.clearTimeout(labelTimer)
      window.removeEventListener('keydown', onKeyDown)
      host.remove()
    },
  }
}

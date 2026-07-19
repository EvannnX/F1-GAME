import { storage } from '../utils/storage'
import { formatLapTime } from '../utils/math'
import type { Difficulty } from '../game/opponents'
import type { InputMode } from '../input'

export type CommentaryMode = 'off' | 'commentary' | 'coach'
export type CameraMode = 'first' | 'third'

export interface MenuStartConfig {
  difficulty: Difficulty
  inputMode: InputMode
  performanceMode: boolean
  cameraMode: CameraMode
  /** Audio guidance during the race:
   *   - 'commentary' = pre-recorded race-announcer clips
   *   - 'coach'      = TTS driving-coach cues (turn / brake / push)
   *   - 'off'        = silent */
  commentaryMode: CommentaryMode
}

export interface MenuController {
  show: (onStart: (cfg: MenuStartConfig) => void) => void
  hide: () => void
}

const DIFF_LABELS: Record<Difficulty, { label: string; tag: string }> = {
  easy: { label: '简 单', tag: '新手友好' },
  medium: { label: '中 等', tag: '势均力敌' },
  hard: { label: '困 难', tag: '强劲对手' },
}

const INPUT_LABELS: Record<InputMode, { label: string; tag: string }> = {
  keyboard: { label: '键 盘', tag: 'WASD/方向键' },
  touch: { label: '触 屏', tag: '左右半屏' },
  gyro: { label: '体 感', tag: '倾斜手机' },
}

const COMMENTARY_LABELS: Record<CommentaryMode, { label: string; tag: string }> = {
  off:        { label: '关 闭', tag: '安静比赛' },
  commentary: { label: '解 说', tag: 'AI 解说员' },
  coach:      { label: '辅 助', tag: '驾驶教练' },
}

const QUALITY_LABELS: Record<'performance' | 'quality', { label: string; tag: string }> = {
  performance: { label: '流 畅', tag: '低负载' },
  quality: { label: '高 质', tag: '完整光影' },
}

const CAMERA_LABELS: Record<CameraMode, { label: string; tag: string }> = {
  first: { label: '第一视角', tag: '座舱内' },
  third: { label: '第三视角', tag: '追车镜头' },
}

const isCoarsePointer = (): boolean => {
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

const MENU_STYLE_ID = 'f1s-race-menu-style'

function installMenuStyles(): void {
  if (document.getElementById(MENU_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = MENU_STYLE_ID
  style.textContent = `
    .f1s-race-menu {
      position: fixed;
      inset: 0;
      z-index: 100;
      overflow: hidden;
      background: #d7d9de;
      color: #15171c;
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      isolation: isolate;
    }
    .f1s-race-menu::before {
      content: '';
      position: absolute;
      right: -8vw;
      bottom: -23vh;
      width: 68vw;
      height: 48vh;
      border: 42px solid rgba(255, 255, 255, .42);
      border-radius: 50%;
      transform: rotate(-8deg);
      pointer-events: none;
    }
    .f1s-race-menu__topline {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 7px;
      background: #d41222;
      box-shadow: 0 2px 16px rgba(0, 0, 0, .28);
    }
    .f1s-race-menu__heading {
      position: absolute;
      top: 24px;
      left: clamp(20px, 5vw, 74px);
      display: flex;
      min-width: min(370px, 54vw);
      height: 58px;
      align-items: center;
      padding: 0 46px 0 64px;
      background: rgba(250, 250, 251, .98);
      clip-path: polygon(0 0, 100% 0, calc(100% - 32px) 100%, 0 100%);
      box-shadow: 0 8px 22px rgba(27, 30, 37, .16);
      font-size: 22px;
      font-weight: 950;
      letter-spacing: 0;
    }
    .f1s-race-menu__heading::before {
      content: '';
      position: absolute;
      left: 24px;
      width: 20px;
      height: 20px;
      border: 6px solid #d41222;
      transform: rotate(45deg);
    }
    .f1s-race-menu__brand {
      position: absolute;
      top: 30px;
      right: clamp(22px, 5vw, 76px);
      color: #b5b8c0;
      font-size: clamp(24px, 4vw, 48px);
      font-style: italic;
      font-weight: 950;
      letter-spacing: 0;
    }
    .f1s-race-menu__brand span { color: #d41222; }
    .f1s-race-menu__settings {
      position: absolute;
      z-index: 1;
      top: 118px;
      bottom: 116px;
      left: 50%;
      display: grid;
      width: min(1120px, calc(100vw - 72px));
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px 24px;
      align-content: center;
      transform: translateX(-50%);
    }
    .f1s-race-menu__setting {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 8px;
    }
    .f1s-race-menu__caption {
      color: #585c65;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0;
    }
    .f1s-race-menu__options {
      display: grid;
      grid-template-columns: repeat(var(--option-count), minmax(0, 1fr));
      gap: 9px;
    }
    .f1s-race-menu__option {
      display: flex;
      min-width: 0;
      min-height: 66px;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      padding: 8px 13px 8px 16px;
      border: 1px solid #bec1c8;
      border-left: 6px solid transparent;
      border-radius: 4px;
      background: rgba(250, 250, 251, .96);
      color: #20232a;
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(32, 36, 44, .09);
      transition: border-color .14s ease, background .14s ease, color .14s ease, transform .14s ease;
    }
    .f1s-race-menu__option:hover,
    .f1s-race-menu__option:focus-visible {
      border-color: #d41222;
      outline: none;
      transform: translateY(-1px);
    }
    .f1s-race-menu__option.is-active {
      border-color: #b80f1d;
      border-left-color: #fff;
      background: #b80f1d;
      color: #fff;
    }
    .f1s-race-menu__label {
      overflow: hidden;
      width: 100%;
      font-size: 16px;
      font-weight: 950;
      letter-spacing: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .f1s-race-menu__tag {
      overflow: hidden;
      width: 100%;
      margin-top: 3px;
      opacity: .66;
      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .f1s-race-menu__footer {
      position: absolute;
      z-index: 2;
      right: clamp(20px, 5vw, 76px);
      bottom: max(26px, calc(env(safe-area-inset-bottom) + 18px));
      left: clamp(20px, 5vw, 76px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .f1s-race-menu__best {
      color: #60646d;
      font-size: 13px;
      font-weight: 850;
      letter-spacing: 0;
    }
    .f1s-race-menu__start {
      position: relative;
      min-width: 310px;
      min-height: 72px;
      padding: 0 68px 0 48px;
      border: 2px solid #fff;
      border-radius: 6px;
      background: #b80f1d;
      color: #fff;
      font: 950 21px/1 Inter, "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 12px 26px rgba(42, 10, 14, .3);
      transition: background .16s ease, transform .16s ease;
    }
    .f1s-race-menu__start::after {
      content: '›';
      position: absolute;
      top: 50%;
      right: 28px;
      font: 500 38px/1 Arial, sans-serif;
      transform: translateY(-55%);
    }
    .f1s-race-menu__start:hover,
    .f1s-race-menu__start:focus-visible {
      background: #e01a2b;
      outline: none;
      transform: translateY(-2px);
    }
    @media (max-height: 620px) {
      .f1s-race-menu__heading {
        top: 14px;
        height: 46px;
        min-width: 290px;
        padding-left: 54px;
        font-size: 17px;
      }
      .f1s-race-menu__heading::before { left: 20px; width: 15px; height: 15px; border-width: 4px; }
      .f1s-race-menu__brand { top: 20px; font-size: 28px; }
      .f1s-race-menu__settings {
        top: 72px;
        bottom: 78px;
        width: calc(100vw - 36px);
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px 10px;
      }
      .f1s-race-menu__setting { gap: 4px; }
      .f1s-race-menu__caption { font-size: 10px; }
      .f1s-race-menu__options { gap: 5px; }
      .f1s-race-menu__option { min-height: 48px; padding: 5px 7px 5px 9px; border-left-width: 4px; }
      .f1s-race-menu__label { font-size: 13px; }
      .f1s-race-menu__tag { margin-top: 1px; font-size: 8px; }
      .f1s-race-menu__footer { right: 18px; bottom: 12px; left: 18px; }
      .f1s-race-menu__start { min-width: 240px; min-height: 56px; font-size: 18px; }
      .f1s-race-menu__best { font-size: 11px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .f1s-race-menu__option,
      .f1s-race-menu__start { transition: none; }
    }
  `
  document.head.appendChild(style)
}

export function createMenu(): MenuController {
  let host: HTMLDivElement | null = null

  const show = (onStart: (cfg: MenuStartConfig) => void): void => {
    hide()
    installMenuStyles()
    host = document.createElement('div')
    host.className = 'f1s-race-menu'
    host.setAttribute('aria-label', '比赛设置')

    const topLine = document.createElement('div')
    topLine.className = 'f1s-race-menu__topline'
    const title = document.createElement('div')
    title.className = 'f1s-race-menu__heading'
    title.textContent = '比赛设置'

    const brand = document.createElement('div')
    brand.className = 'f1s-race-menu__brand'
    brand.innerHTML = 'F1<span>TI</span>'

    const makeRow = (
      caption: string,
      keys: string[],
      labels: Record<string, { label: string; tag: string }>,
      initial: string,
      onChange: (key: string) => void,
    ): HTMLDivElement => {
      const wrap = document.createElement('div')
      wrap.className = 'f1s-race-menu__setting'
      const cap = document.createElement('div')
      cap.textContent = caption
      cap.className = 'f1s-race-menu__caption'
      const row = document.createElement('div')
      row.className = 'f1s-race-menu__options'
      row.style.setProperty('--option-count', String(keys.length))
      let selected = initial
      const buttons: Record<string, HTMLButtonElement> = {}
      const paint = (): void => {
        for (const k of keys) {
          const b = buttons[k]
          const active = k === selected
          b.classList.toggle('is-active', active)
          b.setAttribute('aria-pressed', String(active))
        }
      }
      for (const k of keys) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'f1s-race-menu__option'
        const lab = document.createElement('div')
        lab.textContent = labels[k].label
        lab.className = 'f1s-race-menu__label'
        const tag = document.createElement('div')
        tag.textContent = labels[k].tag
        tag.className = 'f1s-race-menu__tag'
        b.appendChild(lab)
        b.appendChild(tag)
        b.addEventListener('click', () => {
          selected = k
          paint()
          onChange(k)
        })
        buttons[k] = b
        row.appendChild(b)
      }
      paint()
      wrap.appendChild(cap)
      wrap.appendChild(row)
      return wrap
    }

    let chosenDiff: Difficulty = 'medium'
    let chosenInput: InputMode = isCoarsePointer() ? 'touch' : 'keyboard'
    let chosenCommentary: CommentaryMode = 'commentary'
    let chosenQuality: 'performance' | 'quality' =
      storage.getPerformanceMode() || isCoarsePointer() ? 'performance' : 'quality'
    let chosenCamera: CameraMode = 'third'

    const diffRow = makeRow(
      '难  度',
      ['easy', 'medium', 'hard'],
      DIFF_LABELS as Record<string, { label: string; tag: string }>,
      chosenDiff,
      (k) => { chosenDiff = k as Difficulty },
    )

    const inputRow = makeRow(
      '操 作 方 式',
      ['keyboard', 'touch', 'gyro'],
      INPUT_LABELS as Record<string, { label: string; tag: string }>,
      chosenInput,
      (k) => { chosenInput = k as InputMode },
    )

    const commentaryRow = makeRow(
      '语  音',
      ['off', 'commentary', 'coach'],
      COMMENTARY_LABELS as Record<string, { label: string; tag: string }>,
      chosenCommentary,
      (k) => { chosenCommentary = k as CommentaryMode },
    )

    const qualityRow = makeRow(
      '画  质',
      ['performance', 'quality'],
      QUALITY_LABELS,
      chosenQuality,
      (k) => {
        chosenQuality = k as 'performance' | 'quality'
        storage.setPerformanceMode(chosenQuality === 'performance')
      },
    )

    const cameraRow = makeRow(
      '视  角',
      ['first', 'third'],
      CAMERA_LABELS,
      chosenCamera,
      (k) => { chosenCamera = k as CameraMode },
    )

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'f1s-race-menu__start'
    btn.textContent = '开始比赛'
    btn.addEventListener('click', () => {
      // CRITICAL for iOS: DeviceOrientationEvent.requestPermission() MUST
      // be invoked synchronously inside the user-gesture click handler.
      // Any `await` before the call moves us out of the gesture frame and
      // iOS silently no-ops the prompt. We always ask (regardless of which
      // input mode the user picked) so the prompt is out of the way; if
      // they later switch to gyro mid-game, no extra prompt is needed.
      try {
        const D = (window as unknown as {
          DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> }
        }).DeviceOrientationEvent
        if (D && typeof D.requestPermission === 'function') {
          void D.requestPermission().catch((e) => {
            console.warn('[F1S][menu] iOS gyro permission ask failed:', e)
          })
        }
        const M = (window as unknown as {
          DeviceMotionEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> }
        }).DeviceMotionEvent
        if (M && typeof M.requestPermission === 'function') {
          void M.requestPermission().catch((e) => {
            console.warn('[F1S][menu] iOS motion permission ask failed:', e)
          })
        }
      } catch (e) {
        console.warn('[F1S][menu] iOS permission setup failed:', e)
      }
      onStart({
        difficulty: chosenDiff,
        inputMode: chosenInput,
        performanceMode: chosenQuality === 'performance',
        cameraMode: chosenCamera,
        commentaryMode: chosenCommentary,
      })
    }, { once: true })

    const best = storage.getBestLap()
    const bestEl = document.createElement('div')
    bestEl.className = 'f1s-race-menu__best'
    bestEl.textContent = best ? `个人最佳: ${formatLapTime(best)}` : '首次挑战'

    const settings = document.createElement('div')
    settings.className = 'f1s-race-menu__settings'
    settings.append(diffRow, inputRow, commentaryRow, qualityRow, cameraRow)

    const footer = document.createElement('div')
    footer.className = 'f1s-race-menu__footer'
    footer.append(bestEl, btn)

    host.append(topLine, title, brand, settings, footer)
    document.body.appendChild(host)
    document.body.classList.add('f1s-race-menu-active')
  }

  const hide = (): void => {
    if (host && host.parentElement) host.parentElement.removeChild(host)
    host = null
    document.body.classList.remove('f1s-race-menu-active')
  }

  return { show, hide }
}

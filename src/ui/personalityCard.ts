/**
 * Animated post-race personality credential.
 *
 * The entrance sequence is intentionally finite: after roughly 1.5 seconds
 * every moving layer settles into a static, screenshot-friendly card. This
 * keeps the result cinematic without leaving a permanent GPU animation alive.
 */

import { generateRacerPersonalityResult } from '../racerPersonality'
import type { RaceData } from '../racerPersonality'
import type { PlayerStats, RacerPersonalityResult } from '../racerPersonality'
import antonelliPortrait from '../../F1-卡通图/KimiAntonelli.png?url'
import hamiltonPortrait from '../../F1-卡通图/LouisHamilton.png?url'
import verstappenPortrait from '../../F1-卡通图/MaxVerstappen.png?url'
import trackMarkUrl from '../assets/ui/f1ti-track-mark.png?url'

const PORTRAIT_BY_TYPECODE: Record<string, string> = {
  ANTO: antonelliPortrait,
  HMLT: hamiltonPortrait,
  VSTP: verstappenPortrait,
}

export interface RaceTelemetry {
  bestLapMs: number
  topSpeedKmh: number
  wallHits: number
  carHits: number
  finalPosition: number
  fieldSize: number
}

export interface PersonalityCardController {
  show: (stats: Partial<PlayerStats> | RaceData, telemetry?: RaceTelemetry) => Promise<PersonalityCardAction>
  showResult: (result: RacerPersonalityResult, telemetry?: RaceTelemetry) => Promise<PersonalityCardAction>
  hide: () => void
}

export type PersonalityCardAction = 'continue' | 'menu'

interface CardTheme {
  accent: string
  accentBright: string
  accentRgb: string
}

const THEMES: Record<string, CardTheme> = {
  VSTP: { accent: '#ff2d24', accentBright: '#ff665f', accentRgb: '255,45,36' },
  HMLT: { accent: '#8d72ff', accentBright: '#b9aaff', accentRgb: '141,114,255' },
  ANTO: { accent: '#15d3aa', accentBright: '#6fffdc', accentRgb: '21,211,170' },
}

const DEFAULT_THEME: CardTheme = {
  accent: '#ff2d24',
  accentBright: '#ff665f',
  accentRgb: '255,45,36',
}

const formatLap = (ms: number): string => {
  if (!ms || ms <= 0) return '—'
  const total = Math.floor(ms)
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const millis = Math.floor(total % 1000)
  return `${m}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

const buildTelemetryReasons = (
  telemetry: RaceTelemetry,
  archetypeFlavour: string | undefined,
): string[] => {
  const reasons: string[] = []

  if (telemetry.bestLapMs > 0) {
    reasons.push(`你的单圈用时 ${formatLap(telemetry.bestLapMs)}，是这场比赛节奏感的真实写照。`)
  }

  if (telemetry.topSpeedKmh > 0) {
    const speed = Math.round(telemetry.topSpeedKmh)
    if (speed >= 290) reasons.push(`最高时速 ${speed} km/h——你确实敢把油门踩到底。`)
    else if (speed >= 240) reasons.push(`最高时速 ${speed} km/h，直道上你愿意搏一把。`)
    else reasons.push(`最高时速 ${speed} km/h，你更倾向于稳住而不是堆速。`)
  }

  const totalHits = telemetry.wallHits + telemetry.carHits
  if (totalHits === 0) {
    reasons.push('全场零接触、零撞墙，走线干净得像在跑计时赛。')
  } else if (telemetry.carHits === 0) {
    reasons.push(`撞墙 ${telemetry.wallHits} 次但全程没碰对手——极限是你跟自己较劲的事。`)
  } else if (telemetry.wallHits === 0) {
    reasons.push(`与对手 ${telemetry.carHits} 次接触，进攻意图非常明确。`)
  } else {
    reasons.push(`撞墙 ${telemetry.wallHits} 次、与对手 ${telemetry.carHits} 次接触——这场比赛主打先冲再说。`)
  }

  const position = telemetry.finalPosition
  const fieldSize = telemetry.fieldSize
  if (position === 1) reasons.push(`最终 P1/${fieldSize}，把领跑变成了节奏控制。`)
  else if (position === fieldSize) reasons.push(`最终 P${position}/${fieldSize}，压力下的成长比名次更值得记录。`)
  else reasons.push(`最终 P${position}/${fieldSize}，在混战中找到了自己的位置。`)

  if (archetypeFlavour) reasons.push(archetypeFlavour)
  return reasons
}

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag)
  element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

const makeTrackMark = (): HTMLImageElement => {
  const image = document.createElement('img')
  image.className = 'f1ti-pc__track'
  image.src = trackMarkUrl
  image.alt = ''
  image.setAttribute('aria-hidden', 'true')
  return image
}

const animateInteger = (
  target: HTMLElement,
  endValue: number,
  suffix: string,
  stillMounted: () => boolean,
): void => {
  const durationMs = 720
  const startAt = performance.now()

  const tick = (now: number): void => {
    if (!stillMounted()) return
    const progress = Math.min(1, (now - startAt) / durationMs)
    const eased = 1 - Math.pow(1 - progress, 3)
    target.textContent = `${Math.round(endValue * eased)}${suffix}`
    if (progress < 1) requestAnimationFrame(tick)
  }

  requestAnimationFrame(tick)
}

export function createPersonalityCard(): PersonalityCardController {
  let host: HTMLDivElement | null = null
  let resolveFn: ((action: PersonalityCardAction) => void) | null = null

  const hide = (action: PersonalityCardAction = 'continue'): void => {
    const outgoingHost = host
    host = null
    if (outgoingHost?.parentElement) outgoingHost.parentElement.removeChild(outgoingHost)

    if (resolveFn) {
      const resolve = resolveFn
      resolveFn = null
      resolve(action)
    }
  }

  const showResult = (
    data: RacerPersonalityResult,
    telemetry?: RaceTelemetry,
  ): Promise<PersonalityCardAction> => {
    hide()

    const personality = data['你的赛车人格']
    const typeCode = personality['类型代码'] || 'F1TI'
    const theme = THEMES[typeCode] ?? DEFAULT_THEME
    const rawReasons = telemetry
      ? buildTelemetryReasons(telemetry, data['为何你是这个类型'].at(-1))
      : data['为何你是这个类型']
    const reasons = rawReasons.slice(0, 3)
    const tags = data['核心标签'].slice(0, 4)
    const serial = `PR-${typeCode}-${String(personality['匹配度']).padStart(3, '0')}`

    return new Promise<PersonalityCardAction>((resolve) => {
      resolveFn = resolve

      const overlay = createElement('div', 'f1ti-pc')
      host = overlay
      overlay.style.setProperty('--pc-accent', theme.accent)
      overlay.style.setProperty('--pc-accent-bright', theme.accentBright)
      overlay.style.setProperty('--pc-accent-rgb', theme.accentRgb)

      const style = document.createElement('style')
      style.textContent = `
        .f1ti-pc {
          --pc-accent: #ff2d24;
          --pc-accent-bright: #ff665f;
          --pc-accent-rgb: 255,45,36;
          position: fixed;
          inset: 0;
          z-index: 210;
          box-sizing: border-box;
          display: grid;
          place-items: center;
          padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
            max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
          overflow: hidden;
          color: #f7f8fa;
          background:
            radial-gradient(circle at 18% 28%, rgba(var(--pc-accent-rgb), .17), transparent 31%),
            radial-gradient(circle at 84% 74%, rgba(52, 75, 111, .18), transparent 36%),
            #05070b;
          font-family: Inter, "Arial Narrow", "PingFang SC", "Microsoft YaHei", sans-serif;
          animation: f1ti-pc-overlay-in 300ms ease-out both;
        }
        .f1ti-pc, .f1ti-pc * { box-sizing: border-box; }
        .f1ti-pc::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .22;
          background-image:
            linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
          background-size: 38px 38px;
          mask-image: linear-gradient(to bottom, #000, transparent 92%);
        }
        .f1ti-pc__shell {
          width: min(1220px, 94vw, calc(78vh * 1.76));
          display: flex;
          flex-direction: column;
          gap: clamp(10px, 1.4vh, 16px);
          position: relative;
          z-index: 1;
        }
        .f1ti-pc__card {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          min-height: 0;
          overflow: hidden;
          isolation: isolate;
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 4px;
          background:
            linear-gradient(115deg, rgba(255,255,255,.055), transparent 28%),
            linear-gradient(135deg, #151a23 0 38%, #0b0f16 38% 100%);
          box-shadow:
            0 30px 80px rgba(0,0,0,.58),
            0 0 0 1px rgba(var(--pc-accent-rgb), .12) inset;
          clip-path: polygon(0 0, 97.5% 0, 100% 4.5%, 100% 100%, 2.5% 100%, 0 95.5%);
          animation: f1ti-pc-card-in 620ms cubic-bezier(.18,.84,.24,1) both;
        }
        .f1ti-pc__card::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 7;
          pointer-events: none;
          background: linear-gradient(110deg, transparent 0 42%, rgba(255,255,255,.4) 48%, transparent 54%);
          transform: translateX(-120%);
          animation: f1ti-pc-sheen 900ms 420ms ease-out both;
        }
        .f1ti-pc__card::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          z-index: 5;
          width: 100%;
          height: 3px;
          background: linear-gradient(90deg, transparent, var(--pc-accent), #fff, var(--pc-accent), transparent);
          box-shadow: 0 0 18px rgba(var(--pc-accent-rgb), .9);
          transform: translateY(-4px);
          animation: f1ti-pc-scan 840ms 240ms cubic-bezier(.2,.8,.2,1) both;
        }
        .f1ti-pc__rail {
          position: absolute;
          inset: 0 auto 0 0;
          z-index: 0;
          width: 43%;
          overflow: hidden;
          background:
            linear-gradient(160deg, rgba(var(--pc-accent-rgb), .96), rgba(var(--pc-accent-rgb), .48) 39%, #10151e 39.2%);
          clip-path: polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%);
        }
        .f1ti-pc__rail::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: .16;
          background: repeating-linear-gradient(-58deg, transparent 0 15px, #fff 16px 17px);
        }
        .f1ti-pc__number {
          position: absolute;
          top: 2%;
          left: 2%;
          color: rgba(255,255,255,.11);
          font-family: Impact, "Arial Black", sans-serif;
          font-size: clamp(120px, 22vw, 320px);
          font-style: italic;
          line-height: .86;
          letter-spacing: -.08em;
          transform: translateX(-10%);
          user-select: none;
        }
        .f1ti-pc__track {
          position: absolute;
          top: 6%;
          right: 6%;
          width: 38%;
          color: rgba(255,255,255,.2);
          filter: drop-shadow(0 0 8px rgba(255,255,255,.08));
          transform: rotate(-8deg);
          animation: f1ti-pc-track-in 760ms 520ms cubic-bezier(.2,.8,.2,1) both;
        }
        .f1ti-pc__portrait {
          position: absolute;
          z-index: 2;
          left: -1%;
          bottom: -4%;
          width: 46%;
          height: 101%;
          object-fit: contain;
          object-position: center bottom;
          filter: drop-shadow(18px 20px 18px rgba(0,0,0,.42));
          transform-origin: 50% 100%;
          animation: f1ti-pc-driver-in 720ms 240ms cubic-bezier(.12,.86,.26,1.12) both;
        }
        .f1ti-pc__portrait--missing { display: none; }
        .f1ti-pc__portrait-shadow {
          position: absolute;
          z-index: 1;
          left: 7%;
          bottom: 4%;
          width: 30%;
          height: 9%;
          border-radius: 50%;
          background: rgba(0,0,0,.48);
          filter: blur(12px);
        }
        .f1ti-pc__content {
          position: absolute;
          z-index: 3;
          inset: 0 0 0 40%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          padding: clamp(22px, 3.2vw, 48px) clamp(24px, 4vw, 58px) clamp(18px, 2.5vw, 36px);
        }
        .f1ti-pc__eyebrow {
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(238,243,252,.62);
          font-family: "Arial Narrow", Inter, sans-serif;
          font-size: clamp(9px, .9vw, 12px);
          font-weight: 800;
          letter-spacing: .22em;
          text-transform: uppercase;
          animation: f1ti-pc-copy-in 420ms 430ms ease-out both;
        }
        .f1ti-pc__eyebrow::before {
          content: "";
          width: 28px;
          height: 3px;
          background: var(--pc-accent);
          box-shadow: 0 0 10px rgba(var(--pc-accent-rgb), .7);
        }
        .f1ti-pc__serial {
          margin-left: auto;
          color: rgba(238,243,252,.4);
          letter-spacing: .16em;
        }
        .f1ti-pc__driver {
          max-width: 100%;
          margin: clamp(12px, 2.2vh, 22px) 0 2px;
          color: #fff;
          font-family: Impact, "Arial Black", "Arial Narrow", sans-serif;
          font-size: clamp(34px, 5.2vw, 76px);
          font-style: italic;
          font-weight: 900;
          line-height: .92;
          letter-spacing: .018em;
          text-transform: uppercase;
          text-wrap: balance;
          text-shadow: 0 8px 25px rgba(0,0,0,.3);
          animation: f1ti-pc-name-in 560ms 520ms cubic-bezier(.18,.82,.25,1) both;
        }
        .f1ti-pc__type {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: clamp(7px, 1.2vh, 12px);
          color: var(--pc-accent-bright);
          font-size: clamp(14px, 1.8vw, 24px);
          font-weight: 900;
          letter-spacing: .2em;
          animation: f1ti-pc-copy-in 450ms 690ms ease-out both;
        }
        .f1ti-pc__type::after {
          content: "";
          flex: 1;
          height: 1px;
          opacity: .55;
          background: linear-gradient(90deg, var(--pc-accent), transparent);
        }
        .f1ti-pc__summary {
          margin: clamp(8px, 1.4vh, 14px) 0 0;
          color: rgba(244,247,252,.82);
          font-size: clamp(13px, 1.35vw, 18px);
          font-weight: 580;
          line-height: 1.6;
          animation: f1ti-pc-copy-in 450ms 760ms ease-out both;
        }
        .f1ti-pc__stats {
          display: grid;
          grid-template-columns: .92fr .76fr 1.32fr 1fr;
          gap: 1px;
          margin-top: clamp(12px, 2vh, 22px);
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.09);
          animation: f1ti-pc-stats-in 540ms 800ms cubic-bezier(.2,.8,.2,1) both;
        }
        .f1ti-pc__stat {
          min-width: 0;
          padding: clamp(8px, 1.2vw, 14px);
          background: rgba(7,10,15,.88);
        }
        .f1ti-pc__stat-value {
          overflow: hidden;
          color: #fff;
          font-family: "Arial Narrow", Inter, sans-serif;
          font-size: clamp(15px, 2vw, 27px);
          font-weight: 900;
          line-height: 1;
          letter-spacing: -.02em;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .f1ti-pc__stat:first-child .f1ti-pc__stat-value { color: var(--pc-accent-bright); }
        .f1ti-pc__stat-label {
          margin-top: 6px;
          color: rgba(238,243,252,.45);
          font-size: clamp(7px, .78vw, 10px);
          font-weight: 800;
          letter-spacing: .14em;
          white-space: nowrap;
        }
        .f1ti-pc__lower {
          flex: 1 1 0;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: clamp(10px, 2vw, 24px);
          margin-top: clamp(10px, 1.6vh, 18px);
          animation: f1ti-pc-copy-in 500ms 940ms ease-out both;
        }
        .f1ti-pc__reason-list {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: clamp(5px, .9vh, 9px);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .f1ti-pc__reason-list::before {
          content: "MATCH EVIDENCE // 匹配依据";
          margin-bottom: 2px;
          color: rgba(238,243,252,.34);
          font-size: clamp(9px, .86vw, 12px);
          font-weight: 850;
          letter-spacing: .16em;
        }
        .f1ti-pc__reason {
          display: grid;
          grid-template-columns: 22px minmax(0, 1fr);
          align-items: start;
          gap: 8px;
          color: rgba(244,247,252,.8);
          font-size: clamp(12px, 1.18vw, 16px);
          font-weight: 580;
          line-height: 1.48;
        }
        .f1ti-pc__reason-index {
          color: var(--pc-accent-bright);
          font-family: "Arial Narrow", Inter, sans-serif;
          font-size: .83em;
          font-weight: 900;
          letter-spacing: .06em;
        }
        .f1ti-pc__tags {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
          gap: 5px;
        }
        .f1ti-pc__tag {
          padding: 4px 7px 4px 10px;
          color: rgba(255,255,255,.75);
          border-right: 2px solid var(--pc-accent);
          background: linear-gradient(90deg, transparent, rgba(var(--pc-accent-rgb), .12));
          font-size: clamp(9px, .9vw, 12px);
          font-weight: 800;
          letter-spacing: .08em;
          white-space: nowrap;
        }
        .f1ti-pc__footer {
          position: absolute;
          z-index: 4;
          right: 0;
          bottom: 0;
          left: 40%;
          height: 10px;
          overflow: hidden;
          opacity: .8;
          background:
            conic-gradient(from 90deg, #f5f5f5 25%, #15181e 0 50%, #f5f5f5 0 75%, #15181e 0)
            0 0 / 20px 20px;
          transform-origin: 0 50%;
          animation: f1ti-pc-flag-in 800ms 1050ms cubic-bezier(.16,.84,.28,1) both;
        }
        .f1ti-pc__corner {
          position: absolute;
          z-index: 5;
          top: 13px;
          right: 15px;
          width: 24px;
          height: 24px;
          border-top: 2px solid var(--pc-accent);
          border-right: 2px solid var(--pc-accent);
          opacity: .8;
        }
        .f1ti-pc__actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          animation: f1ti-pc-actions-in 420ms 1120ms ease-out both;
        }
        .f1ti-pc__button {
          min-height: 44px;
          padding: 0 24px;
          border-radius: 2px;
          color: #f6f8fc;
          font: 800 13px/1 Inter, "PingFang SC", sans-serif;
          letter-spacing: .15em;
          cursor: pointer;
          transition: transform 130ms ease, background-color 130ms ease, border-color 130ms ease;
        }
        .f1ti-pc__button:hover { transform: translateY(-2px); }
        .f1ti-pc__button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
        .f1ti-pc__button--ghost {
          border: 1px solid rgba(255,255,255,.36);
          background: rgba(255,255,255,.04);
        }
        .f1ti-pc__button--ghost:hover { border-color: rgba(255,255,255,.7); }
        .f1ti-pc__button--primary {
          min-width: 132px;
          border: 1px solid var(--pc-accent);
          background: var(--pc-accent);
          box-shadow: 0 8px 24px rgba(var(--pc-accent-rgb), .22);
        }
        .f1ti-pc__button--primary:hover { background: var(--pc-accent-bright); }

        @keyframes f1ti-pc-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes f1ti-pc-card-in {
          from { opacity: 0; transform: translateY(26px) scale(.965); clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); }
          45% { opacity: 1; }
          to { opacity: 1; transform: none; clip-path: polygon(0 0, 97.5% 0, 100% 4.5%, 100% 100%, 2.5% 100%, 0 95.5%); }
        }
        @keyframes f1ti-pc-sheen {
          0% { transform: translateX(-120%); opacity: 0; }
          15% { opacity: .42; }
          100% { transform: translateX(120%); opacity: 0; }
        }
        @keyframes f1ti-pc-scan {
          0% { transform: translateY(-4px); opacity: 0; }
          15% { opacity: 1; }
          90% { opacity: .8; }
          100% { transform: translateY(68vh); opacity: 0; }
        }
        @keyframes f1ti-pc-driver-in {
          from { opacity: 0; transform: translateX(-38px) scale(.88); }
          to { opacity: 1; transform: none; }
        }
        @keyframes f1ti-pc-track-in {
          from { opacity: 0; stroke-dashoffset: 260; }
          to { opacity: 1; stroke-dashoffset: 0; }
        }
        @keyframes f1ti-pc-copy-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes f1ti-pc-name-in {
          from { opacity: 0; transform: translateX(45px); letter-spacing: .13em; }
          to { opacity: 1; transform: none; letter-spacing: .018em; }
        }
        @keyframes f1ti-pc-stats-in {
          from { opacity: 0; transform: scaleX(.7); transform-origin: 0 50%; }
          to { opacity: 1; transform: none; }
        }
        @keyframes f1ti-pc-flag-in {
          from { opacity: 0; transform: scaleX(0); background-position-x: -80px; }
          to { opacity: .8; transform: scaleX(1); background-position-x: 0; }
        }
        @keyframes f1ti-pc-actions-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }

        @media (max-aspect-ratio: 4/5) {
          .f1ti-pc__shell { width: min(92vw, 470px); }
          .f1ti-pc__card {
            aspect-ratio: 4 / 5.65;
            background: linear-gradient(160deg, #151a23 0 36%, #0b0f16 36% 100%);
            clip-path: polygon(0 0, 94% 0, 100% 3.5%, 100% 100%, 6% 100%, 0 96.5%);
          }
          .f1ti-pc__rail {
            inset: 0 0 auto;
            width: 100%;
            height: 38%;
            clip-path: polygon(0 0, 100% 0, 100% 82%, 64% 100%, 0 88%);
          }
          .f1ti-pc__number { top: 1%; left: 1%; font-size: clamp(130px, 46vw, 220px); }
          .f1ti-pc__track { top: 3%; right: 4%; width: 38%; }
          .f1ti-pc__portrait {
            top: 1%;
            bottom: auto;
            left: 5%;
            width: 56%;
            height: 40%;
          }
          .f1ti-pc__portrait-shadow { display: none; }
          .f1ti-pc__content {
            inset: 35% 0 0;
            padding: 18px 22px 21px;
          }
          .f1ti-pc__driver { margin-top: 10px; font-size: clamp(31px, 10vw, 48px); }
          .f1ti-pc__type { font-size: clamp(13px, 4vw, 19px); }
          .f1ti-pc__summary {
            display: -webkit-box;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            font-size: 11px;
          }
          .f1ti-pc__stats { margin-top: 12px; }
          .f1ti-pc__stat { padding: 8px 6px; }
          .f1ti-pc__stat-value { font-size: clamp(14px, 4.2vw, 20px); }
          .f1ti-pc__stat-label { font-size: 7px; letter-spacing: .07em; }
          .f1ti-pc__lower { grid-template-columns: minmax(0, 1fr); margin-top: 10px; }
          .f1ti-pc__reason { font-size: clamp(9px, 2.65vw, 12px); }
          .f1ti-pc__reason:nth-child(3) { display: none; }
          .f1ti-pc__tags {
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            overflow: hidden;
          }
          .f1ti-pc__tag { border-right: 0; border-bottom: 2px solid var(--pc-accent); }
          .f1ti-pc__footer { left: 0; }
          .f1ti-pc__actions { justify-content: stretch; }
          .f1ti-pc__button { flex: 1; padding: 0 14px; }
        }

        @media (max-height: 620px) and (min-aspect-ratio: 4/5) {
          .f1ti-pc { padding-top: 8px; padding-bottom: 8px; }
          .f1ti-pc__shell { width: min(1020px, 94vw, calc(84vh * 1.76)); gap: 8px; }
          .f1ti-pc__content { padding: 14px 18px 15px; }
          .f1ti-pc__eyebrow { font-size: 7px; letter-spacing: .13em; }
          .f1ti-pc__driver {
            margin-top: 7px;
            font-size: clamp(24px, 4vw, 36px);
            white-space: nowrap;
          }
          .f1ti-pc__driver--long { font-size: clamp(18px, 2.6vw, 24px); }
          .f1ti-pc__type { margin-top: 5px; font-size: 12px; }
          .f1ti-pc__summary { display: none; }
          .f1ti-pc__stats { margin-top: 8px; }
          .f1ti-pc__stat { padding: 7px 6px; }
          .f1ti-pc__stat-value { font-size: clamp(14px, 2.4vw, 20px); }
          .f1ti-pc__stat--lap .f1ti-pc__stat-value { font-size: 15px; }
          .f1ti-pc__stat-label { margin-top: 4px; font-size: 6px; letter-spacing: .08em; }
          .f1ti-pc__lower { margin-top: 7px; gap: 8px; }
          .f1ti-pc__reason-list { gap: 4px; }
          .f1ti-pc__reason-list::before { margin-bottom: 0; font-size: 7px; }
          .f1ti-pc__reason { grid-template-columns: 18px minmax(0, 1fr); gap: 5px; font-size: 9px; line-height: 1.35; }
          .f1ti-pc__reason:nth-child(3) { display: none; }
          .f1ti-pc__tags { gap: 3px; }
          .f1ti-pc__tag { padding: 3px 5px; font-size: 7px; }
          .f1ti-pc__tag:nth-child(n+3) { display: none; }
          .f1ti-pc__footer { height: 8px; }
          .f1ti-pc__button { min-height: 40px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .f1ti-pc *, .f1ti-pc::before, .f1ti-pc::after {
            animation-duration: 1ms !important;
            animation-delay: 0ms !important;
          }
        }
      `

      const shell = createElement('div', 'f1ti-pc__shell')
      const card = createElement('article', 'f1ti-pc__card')
      card.setAttribute('aria-label', `赛车人格：${personality['类型名称']}`)

      const rail = createElement('div', 'f1ti-pc__rail')
      const number = createElement('div', 'f1ti-pc__number', typeCode.slice(0, 2))
      rail.append(number, makeTrackMark())

      const portraitShadow = createElement('div', 'f1ti-pc__portrait-shadow')
      const portrait = createElement('img', 'f1ti-pc__portrait')
      portrait.alt = `${personality['匹配车手']} 卡通形象`
      const portraitUrl = PORTRAIT_BY_TYPECODE[typeCode]
      if (portraitUrl) portrait.src = portraitUrl
      else portrait.classList.add('f1ti-pc__portrait--missing')
      portrait.addEventListener('error', () => portrait.classList.add('f1ti-pc__portrait--missing'))

      const content = createElement('section', 'f1ti-pc__content')
      const eyebrow = createElement('div', 'f1ti-pc__eyebrow')
      eyebrow.append(
        createElement('span', '', 'F1TI // POST-RACE IDENTITY'),
        createElement('span', 'f1ti-pc__serial', serial),
      )

      const driverName = createElement('h2', 'f1ti-pc__driver', personality['匹配车手'])
      if (personality['匹配车手'].length > 18) {
        driverName.classList.add('f1ti-pc__driver--long')
      }
      const typeName = createElement('div', 'f1ti-pc__type', personality['类型名称'])
      const summary = createElement('p', 'f1ti-pc__summary', personality['一句话总结'])

      const stats = createElement('div', 'f1ti-pc__stats')
      const makeStat = (value: string, label: string): { cell: HTMLDivElement; value: HTMLDivElement } => {
        const cell = createElement('div', 'f1ti-pc__stat')
        const valueElement = createElement('div', 'f1ti-pc__stat-value', value)
        cell.append(valueElement, createElement('div', 'f1ti-pc__stat-label', label))
        return { cell, value: valueElement }
      }

      const matchStat = makeStat('0%', 'PERSONALITY MATCH')
      const positionStat = makeStat(
        telemetry?.finalPosition ? `P${telemetry.finalPosition}` : '—',
        'RACE POSITION',
      )
      const lapStat = makeStat(telemetry ? formatLap(telemetry.bestLapMs) : '—', 'BEST LAP')
      lapStat.cell.classList.add('f1ti-pc__stat--lap')
      const speedStat = makeStat(
        telemetry?.topSpeedKmh ? `${Math.round(telemetry.topSpeedKmh)}` : '—',
        'TOP SPEED KM/H',
      )
      stats.append(matchStat.cell, positionStat.cell, lapStat.cell, speedStat.cell)

      const lower = createElement('div', 'f1ti-pc__lower')
      const reasonList = createElement('ol', 'f1ti-pc__reason-list')
      reasons.forEach((reason, index) => {
        const row = createElement('li', 'f1ti-pc__reason')
        row.append(
          createElement('span', 'f1ti-pc__reason-index', `0${index + 1}`),
          createElement('span', '', reason),
        )
        reasonList.appendChild(row)
      })

      const tagList = createElement('div', 'f1ti-pc__tags')
      tags.forEach((tag) => tagList.appendChild(createElement('span', 'f1ti-pc__tag', `# ${tag}`)))
      lower.append(reasonList, tagList)

      content.append(eyebrow, driverName, typeName, summary, stats, lower)
      card.append(
        rail,
        portraitShadow,
        portrait,
        content,
        createElement('div', 'f1ti-pc__footer'),
        createElement('div', 'f1ti-pc__corner'),
      )

      const actions = createElement('div', 'f1ti-pc__actions')
      const menuButton = createElement('button', 'f1ti-pc__button f1ti-pc__button--ghost', '返回游戏')
      menuButton.type = 'button'
      menuButton.addEventListener('click', () => hide('menu'), { once: true })
      const continueButton = createElement('button', 'f1ti-pc__button f1ti-pc__button--primary', '继续')
      continueButton.type = 'button'
      continueButton.addEventListener('click', () => hide('continue'), { once: true })
      actions.append(menuButton, continueButton)

      shell.append(card, actions)
      overlay.append(style, shell)
      document.body.appendChild(overlay)

      window.setTimeout(() => {
        const currentHost = overlay
        animateInteger(
          matchStat.value,
          personality['匹配度'],
          '%',
          () => host === currentHost && currentHost.isConnected,
        )
      }, 720)
    })
  }

  const show = (
    stats: Partial<PlayerStats> | RaceData,
    telemetry?: RaceTelemetry,
  ): Promise<PersonalityCardAction> => showResult(generateRacerPersonalityResult(stats), telemetry)

  return { show, showResult, hide: () => hide() }
}

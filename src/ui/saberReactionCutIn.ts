import startImageUrl from '../assets/ui/saberReactions/saber-start.png?url'
import coinImageUrl from '../assets/ui/saberReactions/saber-coin.png?url'
import boostImageUrl from '../assets/ui/saberReactions/saber-boost.png?url'
import finishImageUrl from '../assets/ui/saberReactions/saber-finish.png?url'

export type SaberReactionEvent = 'start' | 'coin' | 'boost' | 'finish'

interface ReactionConfig {
  imageUrl: string
  label: string
  accent: string
  accentSoft: string
}

const REACTIONS: Record<SaberReactionEvent, ReactionConfig> = {
  start: {
    imageUrl: startImageUrl,
    label: 'READY',
    accent: '#1763d8',
    accentSoft: '#58c8ff',
  },
  coin: {
    imageUrl: coinImageUrl,
    label: 'COIN GET!',
    accent: '#dc8d0b',
    accentSoft: '#ffe164',
  },
  boost: {
    imageUrl: boostImageUrl,
    label: 'BOOST!',
    accent: '#0678d4',
    accentSoft: '#72f3ff',
  },
  finish: {
    imageUrl: finishImageUrl,
    label: 'VICTORY RUN',
    accent: '#c49425',
    accentSoft: '#fff0a2',
  },
}

const GLOBAL_COOLDOWN_MS = 3600
const VISIBLE_MS = 2250
const STYLE_ID = 'f1s-saber-reaction-style'

export interface SaberReactionCutIn {
  setEnabled: (enabled: boolean) => void
  show: (event: SaberReactionEvent) => boolean
  resetRace: () => void
  dispose: () => void
}

function installStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-saber-reaction {
      --reaction-accent: #1763d8;
      --reaction-soft: #58c8ff;
      position: fixed;
      top: max(7px, env(safe-area-inset-top));
      z-index: 2400;
      width: clamp(270px, 30vw, 490px);
      height: clamp(190px, 27vw, 370px);
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      visibility: hidden;
      contain: layout style;
      filter: drop-shadow(0 14px 18px rgba(0, 0, 0, .32));
    }
    .f1s-saber-reaction[data-side="left"] { left: 0; }
    .f1s-saber-reaction[data-side="right"] { right: 0; }
    .f1s-saber-reaction[data-event="coin"] {
      top: max(clamp(38px, 3.6vw, 58px), env(safe-area-inset-top));
    }
    .f1s-saber-reaction[data-event="boost"] {
      top: max(clamp(34px, 3.2vw, 52px), env(safe-area-inset-top));
    }
    .f1s-saber-reaction[data-event="finish"] {
      top: max(clamp(24px, 2.5vw, 40px), env(safe-area-inset-top));
    }
    .f1s-saber-reaction__panel {
      position: absolute;
      inset: 12% 0 8%;
      overflow: hidden;
      opacity: 0;
      background:
        linear-gradient(118deg, rgba(255,255,255,.22) 0 2%, transparent 2% 12%,
          rgba(255,255,255,.11) 12% 14%, transparent 14%),
        linear-gradient(105deg, var(--reaction-soft), var(--reaction-accent) 68%);
      box-shadow:
        inset 0 2px rgba(255,255,255,.58),
        inset 0 -2px rgba(0,0,0,.18);
    }
    .f1s-saber-reaction[data-side="left"] .f1s-saber-reaction__panel {
      clip-path: polygon(0 0, 91% 0, 100% 50%, 87% 100%, 0 100%);
      transform: translateX(-108%) skewX(-7deg);
      transform-origin: left center;
    }
    .f1s-saber-reaction[data-side="right"] .f1s-saber-reaction__panel {
      clip-path: polygon(9% 0, 100% 0, 100% 100%, 13% 100%, 0 50%);
      transform: translateX(108%) skewX(7deg);
      transform-origin: right center;
    }
    .f1s-saber-reaction__panel::before {
      content: "";
      position: absolute;
      inset: 0;
      opacity: .38;
      background:
        repeating-linear-gradient(118deg, transparent 0 20px, rgba(255,255,255,.23) 21px 23px),
        radial-gradient(circle at 62% 38%, rgba(255,255,255,.38), transparent 46%);
    }
    .f1s-saber-reaction__panel::after {
      content: "";
      position: absolute;
      top: -35%;
      bottom: -35%;
      width: 18%;
      opacity: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.92), transparent);
      transform: skewX(-18deg);
    }
    .f1s-saber-reaction[data-side="left"] .f1s-saber-reaction__panel::after { left: -25%; }
    .f1s-saber-reaction[data-side="right"] .f1s-saber-reaction__panel::after { right: -25%; }
    .f1s-saber-reaction__image {
      position: absolute;
      z-index: 2;
      bottom: 0;
      width: auto;
      height: 100%;
      max-width: 82%;
      object-fit: contain;
      opacity: 0;
      filter: saturate(.94) drop-shadow(0 5px 1px rgba(21, 16, 10, .2));
      will-change: transform, opacity;
    }
    .f1s-saber-reaction[data-side="left"] .f1s-saber-reaction__image {
      left: 1.5%;
      transform: translateX(-76%) rotate(-5deg) scale(.84);
      transform-origin: left bottom;
    }
    .f1s-saber-reaction[data-side="right"] .f1s-saber-reaction__image {
      right: 1.5%;
      transform: translateX(76%) rotate(5deg) scale(.84);
      transform-origin: right bottom;
    }
    .f1s-saber-reaction[data-event="coin"] .f1s-saber-reaction__image {
      height: 130%;
      max-width: none;
      bottom: -14%;
    }
    .f1s-saber-reaction[data-event="boost"] .f1s-saber-reaction__image {
      height: 125%;
      max-width: none;
      bottom: -11%;
    }
    .f1s-saber-reaction[data-event="finish"] .f1s-saber-reaction__image {
      height: 118%;
      max-width: 88%;
      bottom: -8%;
    }
    .f1s-saber-reaction__label {
      position: absolute;
      z-index: 3;
      bottom: 12%;
      color: rgba(255,255,255,.92);
      opacity: 0;
      font: italic 950 clamp(15px, 1.65vw, 25px)/1 Inter, "Arial Black", sans-serif;
      letter-spacing: .1em;
      text-shadow: 0 3px 0 rgba(0,0,0,.22), 0 0 14px rgba(255,255,255,.42);
      white-space: nowrap;
    }
    .f1s-saber-reaction[data-side="left"] .f1s-saber-reaction__label { right: 9%; }
    .f1s-saber-reaction[data-side="right"] .f1s-saber-reaction__label { left: 9%; }
    .f1s-saber-reaction.is-active { visibility: visible; }
    .f1s-saber-reaction.is-active .f1s-saber-reaction__panel {
      animation: f1s-reaction-panel 2250ms cubic-bezier(.14,.76,.2,1) both;
    }
    .f1s-saber-reaction.is-active .f1s-saber-reaction__image {
      animation: f1s-reaction-character 2250ms cubic-bezier(.1,.82,.15,1) both;
    }
    .f1s-saber-reaction.is-active .f1s-saber-reaction__label {
      animation: f1s-reaction-label 2250ms ease both;
    }
    .f1s-saber-reaction.is-active .f1s-saber-reaction__panel::after {
      animation: f1s-reaction-shine 620ms ease-out 270ms both;
    }
    .f1s-saber-reaction.is-preview-static { visibility: visible; }
    .f1s-saber-reaction.is-preview-static .f1s-saber-reaction__panel {
      animation: none !important;
      opacity: .78;
      transform: none !important;
    }
    .f1s-saber-reaction.is-preview-static .f1s-saber-reaction__image {
      animation: none !important;
      opacity: .84;
      transform: none !important;
    }
    .f1s-saber-reaction.is-preview-static .f1s-saber-reaction__label {
      animation: none !important;
      opacity: .88;
      transform: none !important;
    }
    .f1s-saber-reaction.is-preview-static .f1s-saber-reaction__panel::after {
      animation: none !important;
      opacity: 0;
    }
    @keyframes f1s-reaction-panel {
      0% { opacity: 0; }
      11%, 78% { opacity: .78; transform: translateX(0) skewX(0); }
      100% { opacity: 0; }
    }
    @keyframes f1s-reaction-character {
      0% { opacity: 0; }
      13% { opacity: .9; transform: translateX(0) rotate(1deg) scale(1.06); }
      22%, 76% { opacity: .84; transform: translateX(0) rotate(0) scale(1); }
      100% { opacity: 0; transform: translateX(12%) scale(.95); }
    }
    @keyframes f1s-reaction-label {
      0%, 13% { opacity: 0; transform: translateY(9px); }
      23%, 76% { opacity: .88; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-5px); }
    }
    @keyframes f1s-reaction-shine {
      0% { opacity: 0; }
      30% { opacity: .82; }
      100% { opacity: 0; transform: translateX(650%) skewX(-18deg); }
    }
    @media (max-width: 700px) {
      .f1s-saber-reaction {
        width: min(72vw, 330px);
        height: min(52vw, 240px);
      }
      .f1s-saber-reaction__label { bottom: 9%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .f1s-saber-reaction.is-active .f1s-saber-reaction__panel,
      .f1s-saber-reaction.is-active .f1s-saber-reaction__image,
      .f1s-saber-reaction.is-active .f1s-saber-reaction__label {
        animation-duration: 1600ms;
      }
      .f1s-saber-reaction.is-active .f1s-saber-reaction__panel::after { animation: none; }
    }
  `
  document.head.appendChild(style)
}

export function createSaberReactionCutIn(): SaberReactionCutIn {
  installStyle()

  const root = document.createElement('div')
  root.className = 'f1s-saber-reaction'
  root.dataset.side = 'left'
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = `
    <div class="f1s-saber-reaction__panel"></div>
    <img class="f1s-saber-reaction__image" alt="" draggable="false">
    <span class="f1s-saber-reaction__label"></span>
  `
  document.body.appendChild(root)

  const image = root.querySelector<HTMLImageElement>('.f1s-saber-reaction__image')!
  const label = root.querySelector<HTMLSpanElement>('.f1s-saber-reaction__label')!
  for (const config of Object.values(REACTIONS)) {
    const preloaded = new Image()
    preloaded.decoding = 'async'
    preloaded.src = config.imageUrl
  }

  let enabled = false
  let disposed = false
  let active = false
  let nextSide: 'left' | 'right' = 'left'
  let lastShownAt = -Infinity
  let hideTimer = 0
  let pendingFinishTimer = 0

  const clearAnimation = (): void => {
    window.clearTimeout(hideTimer)
    hideTimer = 0
    active = false
    root.classList.remove('is-active')
    root.setAttribute('aria-hidden', 'true')
  }

  const show = (event: SaberReactionEvent): boolean => {
    if (!enabled || disposed) return false
    const now = performance.now()
    const availableAt = lastShownAt + GLOBAL_COOLDOWN_MS
    if (active || now < availableAt) {
      // The finish reaction is part of the result presentation and must not
      // disappear merely because a last-second boost or coin was shown.
      // Queue it for the first non-overlapping slot; ordinary reactions drop.
      if (event === 'finish' && pendingFinishTimer === 0) {
        const delay = Math.max(80, availableAt - now + 60)
        pendingFinishTimer = window.setTimeout(() => {
          pendingFinishTimer = 0
          show('finish')
        }, delay)
      }
      return false
    }

    const config = REACTIONS[event]
    const side = event === 'finish' ? 'right' : nextSide
    if (event !== 'finish') nextSide = side === 'left' ? 'right' : 'left'
    lastShownAt = now
    active = true
    root.dataset.side = side
    root.dataset.event = event
    root.style.setProperty('--reaction-accent', config.accent)
    root.style.setProperty('--reaction-soft', config.accentSoft)
    image.src = config.imageUrl
    label.textContent = config.label
    root.classList.remove('is-active')
    // Restart CSS keyframes when the same reaction is used in a later slot.
    void root.offsetWidth
    root.classList.add('is-active')
    root.setAttribute('aria-hidden', 'false')
    hideTimer = window.setTimeout(clearAnimation, VISIBLE_MS + 40)
    return true
  }

  const resetRace = (): void => {
    clearAnimation()
    window.clearTimeout(pendingFinishTimer)
    pendingFinishTimer = 0
    lastShownAt = -Infinity
    nextSide = 'left'
  }

  return {
    setEnabled: (nextEnabled) => {
      enabled = nextEnabled
      if (!enabled) resetRace()
    },
    show,
    resetRace,
    dispose: () => {
      disposed = true
      resetRace()
      root.remove()
    },
  }
}

const STYLE_ID = 'f1s-page-back-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-page-back {
      position: absolute;
      z-index: 20;
      bottom: max(20px, env(safe-area-inset-bottom));
      left: clamp(20px, 5vw, 74px);
      display: grid;
      width: 92px;
      height: 48px;
      place-items: center;
      border: 2px solid rgba(255, 255, 255, .9);
      border-radius: 4px;
      background: #b80f1d;
      color: #fff;
      font: 800 15px/1 Inter, sans-serif;
      letter-spacing: .08em;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(42, 10, 14, .28);
      transition: background .14s ease, transform .14s ease;
    }
    .f1s-page-back:hover,
    .f1s-page-back:focus-visible {
      background: #e01a2b;
      outline: none;
      transform: translateX(-2px);
    }
    @media (max-height: 700px), (max-width: 760px) {
      .f1s-page-back {
        bottom: max(14px, env(safe-area-inset-bottom));
        left: 18px;
        width: 82px;
        height: 44px;
        font: 800 14px/1 Inter, sans-serif;
      }
    }
    @media (max-height: 620px) {
      .f1s-page-back {
        bottom: max(10px, env(safe-area-inset-bottom));
        width: 76px;
        height: 40px;
      }
    }
    @media (max-width: 960px) and (max-height: 620px) and (orientation: landscape) {
      .f1s-page-back {
        bottom: max(10px, env(safe-area-inset-bottom));
        left: max(12px, env(safe-area-inset-left));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .f1s-page-back { transition: none; }
    }
  `
  document.head.appendChild(style)
}

export function createPageBackButton(onBack: () => void, label = '返回上一页'): HTMLButtonElement {
  installStyles()
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'f1s-page-back'
  button.textContent = '返回'
  button.setAttribute('aria-label', label)
  button.title = label
  button.addEventListener('click', onBack, { once: true })
  return button
}

const STYLE_ID = 'f1s-page-back-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-page-back {
      position: absolute;
      z-index: 20;
      top: 24px;
      left: clamp(20px, 5vw, 74px);
      display: grid;
      width: 58px;
      height: 58px;
      place-items: center;
      border: 2px solid rgba(255, 255, 255, .9);
      border-radius: 4px;
      background: #b80f1d;
      color: #fff;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(42, 10, 14, .28);
      transition: background .14s ease, transform .14s ease;
    }
    .f1s-page-back::before {
      content: '‹';
      font: 500 46px/1 Arial, sans-serif;
      transform: translateY(-3px);
    }
    .f1s-page-back:hover,
    .f1s-page-back:focus-visible {
      background: #e01a2b;
      outline: none;
      transform: translateX(-2px);
    }
    @media (max-height: 700px), (max-width: 760px) {
      .f1s-page-back {
        top: 18px;
        left: 18px;
        width: 50px;
        height: 50px;
      }
      .f1s-page-back::before { font-size: 40px; }
    }
    @media (max-height: 620px) {
      .f1s-page-back {
        top: 14px;
        width: 46px;
        height: 46px;
      }
      .f1s-page-back::before { font-size: 37px; }
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
  button.setAttribute('aria-label', label)
  button.title = label
  button.addEventListener('click', onBack, { once: true })
  return button
}

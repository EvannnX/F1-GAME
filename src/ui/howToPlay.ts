export interface HowToPlayController {
  destroy: () => void
}

type ContinueHandler = () => void | Promise<void>

const STYLE_ID = 'f1s-how-to-play-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-guide {
      position: fixed;
      inset: 0;
      z-index: 520;
      overflow: hidden;
      background: #d7d9de;
      color: #15171c;
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      isolation: isolate;
    }
    .f1s-guide::before {
      content: '';
      position: absolute;
      right: -8vw;
      bottom: -25vh;
      width: 70vw;
      height: 50vh;
      border: 42px solid rgba(255, 255, 255, .44);
      border-radius: 50%;
      transform: rotate(-8deg);
      pointer-events: none;
    }
    .f1s-guide__topline {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 7px;
      background: #d41222;
      box-shadow: 0 2px 16px rgba(0, 0, 0, .28);
    }
    .f1s-guide__heading {
      position: absolute;
      top: 24px;
      left: clamp(20px, 5vw, 74px);
      display: flex;
      min-width: min(370px, 64vw);
      height: 58px;
      align-items: center;
      padding: 0 48px 0 64px;
      background: rgba(250, 250, 251, .98);
      clip-path: polygon(0 0, 100% 0, calc(100% - 32px) 100%, 0 100%);
      box-shadow: 0 8px 22px rgba(27, 30, 37, .16);
      font-size: 22px;
      font-weight: 950;
    }
    .f1s-guide__heading::before {
      content: '';
      position: absolute;
      left: 24px;
      width: 20px;
      height: 20px;
      border: 6px solid #d41222;
      transform: rotate(45deg);
    }
    .f1s-guide__brand {
      position: absolute;
      top: 30px;
      right: clamp(22px, 5vw, 76px);
      color: #252a32;
      font-size: clamp(24px, 4vw, 48px);
      font-style: italic;
      font-weight: 950;
    }
    .f1s-guide__brand span { color: #d41222; }
    .f1s-guide__content {
      position: absolute;
      z-index: 1;
      top: 118px;
      bottom: 116px;
      left: 50%;
      display: grid;
      width: min(1100px, calc(100vw - 72px));
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      align-content: center;
      transform: translateX(-50%);
    }
    .f1s-guide__item {
      display: grid;
      min-width: 0;
      min-height: 126px;
      grid-template-columns: 86px minmax(0, 1fr);
      align-items: center;
      gap: 18px;
      padding: 20px 24px;
      border-left: 7px solid #d41222;
      border-radius: 4px;
      background: rgba(250, 250, 251, .96);
      box-shadow: 0 8px 22px rgba(32, 36, 44, .1);
    }
    .f1s-guide__visual {
      display: flex;
      min-width: 72px;
      min-height: 72px;
      align-items: center;
      justify-content: center;
      color: #d41222;
      font-size: 35px;
      font-weight: 950;
    }
    .f1s-guide__keys {
      display: grid;
      grid-template-columns: repeat(3, 25px);
      grid-template-rows: repeat(2, 25px);
      gap: 3px;
    }
    .f1s-guide__key {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #9b9fa7;
      border-bottom-width: 3px;
      border-radius: 3px;
      background: #fff;
      color: #252a32;
      font-size: 12px;
      font-weight: 900;
    }
    .f1s-guide__key:first-child { grid-column: 2; }
    .f1s-guide__copy h2 {
      margin: 0 0 7px;
      font-size: 19px;
      font-weight: 950;
    }
    .f1s-guide__copy p {
      margin: 0;
      color: #5a5e67;
      font-size: 13px;
      font-weight: 650;
      line-height: 1.55;
    }
    .f1s-guide__footer {
      position: absolute;
      z-index: 2;
      right: clamp(20px, 5vw, 74px);
      bottom: 24px;
    }
    .f1s-guide__continue {
      position: relative;
      min-width: 310px;
      min-height: 68px;
      overflow: hidden;
      border: 1px solid #8d0d17;
      border-radius: 4px;
      background: #b80f1d;
      color: #fff;
      cursor: pointer;
      font: 950 21px/1 Inter, "Helvetica Neue", Arial, sans-serif;
      box-shadow: 0 12px 26px rgba(81, 7, 14, .28);
      transition: background .14s ease, transform .14s ease;
    }
    .f1s-guide__continue::after {
      content: '›';
      position: absolute;
      top: 50%;
      right: 24px;
      font-size: 36px;
      font-weight: 500;
      transform: translateY(-55%);
    }
    .f1s-guide__continue:hover,
    .f1s-guide__continue:focus-visible {
      background: #d41222;
      outline: none;
      transform: translateY(-2px);
    }
    .f1s-guide__continue:disabled { cursor: wait; opacity: .7; transform: none; }
    .f1s-guide--leaving { opacity: 0; transition: opacity .26s ease; pointer-events: none; }
    @media (max-height: 700px), (max-width: 760px) {
      .f1s-guide__heading { top: 18px; height: 50px; min-width: min(300px, 62vw); padding-left: 54px; font-size: 18px; }
      .f1s-guide__heading::before { left: 20px; width: 15px; height: 15px; border-width: 4px; }
      .f1s-guide__brand { top: 20px; font-size: 28px; }
      .f1s-guide__content {
        top: 82px;
        bottom: 88px;
        width: calc(100vw - 36px);
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
      }
      .f1s-guide__item { min-height: 92px; grid-template-columns: 58px minmax(0, 1fr); gap: 9px; padding: 10px 12px; border-left-width: 5px; }
      .f1s-guide__visual { min-width: 52px; min-height: 52px; font-size: 28px; }
      .f1s-guide__copy h2 { margin-bottom: 3px; font-size: 15px; }
      .f1s-guide__copy p { font-size: 10px; line-height: 1.35; }
      .f1s-guide__footer { right: 18px; bottom: 12px; }
      .f1s-guide__continue { min-width: 240px; min-height: 56px; font-size: 18px; }
    }
    @media (max-width: 520px) and (orientation: portrait) {
      .f1s-guide__content { grid-template-columns: 1fr; overflow-y: auto; align-content: start; }
      .f1s-guide__item { min-height: 78px; }
      .f1s-guide__brand { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .f1s-guide__continue, .f1s-guide--leaving { transition: none; }
    }
  `
  document.head.appendChild(style)
}

export function showHowToPlay(onContinue: ContinueHandler): HowToPlayController {
  installStyles()
  const touchDevice = window.matchMedia('(pointer: coarse)').matches
  const host = document.createElement('section')
  host.className = 'f1s-guide'
  host.setAttribute('aria-label', '玩法指南')
  host.innerHTML = `
    <div class="f1s-guide__topline"></div>
    <div class="f1s-guide__heading">玩法指南</div>
    <div class="f1s-guide__brand">F1<span>TI</span></div>
    <div class="f1s-guide__content">
      <div class="f1s-guide__item">
        <div class="f1s-guide__visual">
          ${touchDevice ? '↔' : '<div class="f1s-guide__keys"><span class="f1s-guide__key">W</span><span class="f1s-guide__key">A</span><span class="f1s-guide__key">S</span><span class="f1s-guide__key">D</span></div>'}
        </div>
        <div class="f1s-guide__copy"><h2>驾驶赛车</h2><p>${touchDevice ? '使用屏幕驾驶按键，或在设置中选择手机体感操控。' : '使用 WASD 或方向键完成加速、刹车和左右转向。'}</p></div>
      </div>
      <div class="f1s-guide__item">
        <div class="f1s-guide__visual">◀ ▶</div>
        <div class="f1s-guide__copy"><h2>平稳转向</h2><p>入弯前减速，驶离赛道路面会明显降低抓地力和速度。</p></div>
      </div>
      <div class="f1s-guide__item">
        <div class="f1s-guide__visual">◎</div>
        <div class="f1s-guide__copy"><h2>完成比赛</h2><p>沿完整赛道通过检查点并冲过终点，用更短时间完成比赛。</p></div>
      </div>
      <div class="f1s-guide__item">
        <div class="f1s-guide__visual">F1</div>
        <div class="f1s-guide__copy"><h2>测出 F1TI</h2><p>比赛结束后，系统会根据你的速度、稳定性和驾驶风格生成 F1TI 结果卡。</p></div>
      </div>
    </div>
    <div class="f1s-guide__footer"><button class="f1s-guide__continue" type="button">知道了，选择赛车</button></div>
  `
  document.body.appendChild(host)
  document.body.classList.add('f1s-guide-active')

  let destroyed = false
  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    document.body.classList.remove('f1s-guide-active')
    host.remove()
  }

  const button = host.querySelector<HTMLButtonElement>('.f1s-guide__continue')!
  let continuing = false
  button.addEventListener('click', () => {
    if (continuing) return
    continuing = true
    button.disabled = true
    button.textContent = '正在进入车库'
    void Promise.resolve(onContinue()).then(() => {
      host.classList.add('f1s-guide--leaving')
      window.setTimeout(destroy, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260)
    }).catch((error) => {
      console.warn('[F1S] guide continuation failed:', error)
      continuing = false
      button.disabled = false
      button.textContent = '重试进入车库'
    })
  })

  return { destroy }
}

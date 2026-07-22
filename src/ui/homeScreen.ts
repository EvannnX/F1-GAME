import homeBackgroundVideoUrl from '../f1ti/首页背景视频.mp4?url'

export interface HomeScreenController {
  destroy: () => void
}

type StartHandler = () => void | Promise<void>

const STYLE_ID = 'f1s-home-screen-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-home {
      position: fixed;
      inset: 0;
      z-index: 500;
      overflow: hidden;
      background: #050608;
      color: #fff;
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      isolation: isolate;
    }
    .f1s-home__video {
      position: absolute;
      inset: 0;
      z-index: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      background: #050608;
    }
    .f1s-home__shade {
      position: absolute;
      inset: 0;
      z-index: 1;
      background: rgba(0, 0, 0, .14);
      pointer-events: none;
    }
    .f1s-home__footer {
      position: absolute;
      z-index: 3;
      left: 50%;
      bottom: max(30px, calc(env(safe-area-inset-bottom) + 20px));
      width: min(500px, calc(100vw - 36px));
      transform: translateX(-50%);
    }
    .f1s-home__start {
      position: relative;
      width: 100%;
      min-height: 68px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, .9);
      border-radius: 3px;
      background: rgba(247, 248, 250, .96);
      color: #101319;
      font: 950 22px/1 Inter, "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 14px 38px rgba(0, 0, 0, .44);
      transition: transform .16s ease, background .16s ease, color .16s ease;
    }
    .f1s-home__start::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 12px;
      background: #ed1b2f;
    }
    .f1s-home__start::after {
      content: '›';
      position: absolute;
      top: 50%;
      right: 24px;
      color: #ed1b2f;
      font-size: 38px;
      font-weight: 500;
      transform: translateY(-54%);
    }
    .f1s-home__start:hover,
    .f1s-home__start:focus-visible {
      background: #ed1b2f;
      color: #fff;
      outline: none;
      transform: translateY(-2px);
    }
    .f1s-home__start:hover::before,
    .f1s-home__start:focus-visible::before { background: #fff; }
    .f1s-home__start:hover::after,
    .f1s-home__start:focus-visible::after { color: #fff; }
    .f1s-home__start:disabled {
      cursor: wait;
      opacity: .76;
      transform: none;
    }
    .f1s-home--launching .f1s-home__start {
      background: #ed1b2f;
      color: #fff;
    }
    .f1s-home--launching .f1s-home__start::before { background: #fff; }
    .f1s-home--launching .f1s-home__start::after { color: #fff; }
    .f1s-home--leaving {
      opacity: 0;
      transition: opacity .3s ease;
      pointer-events: none;
    }
    @media (max-width: 680px) {
      .f1s-home__footer { bottom: max(20px, calc(env(safe-area-inset-bottom) + 14px)); }
      .f1s-home__start { min-height: 60px; font-size: 19px; }
    }
    @media (max-height: 560px) {
      .f1s-home__footer { bottom: 16px; width: min(440px, calc(100vw - 32px)); }
      .f1s-home__start { min-height: 54px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .f1s-home__start,
      .f1s-home--leaving { transition: none; }
    }
  `
  document.head.appendChild(style)
}

export function showHomeScreen(onStart: StartHandler): HomeScreenController {
  installStyles()

  const host = document.createElement('section')
  host.className = 'f1s-home'
  host.setAttribute('aria-label', 'F1TI 主菜单')
  host.innerHTML = `
    <video class="f1s-home__video" autoplay muted loop playsinline preload="auto" aria-hidden="true"></video>
    <div class="f1s-home__shade"></div>
    <div class="f1s-home__footer">
      <button class="f1s-home__start" type="button">开始比赛</button>
    </div>
  `
  document.body.appendChild(host)
  document.body.classList.add('f1s-home-active')

  const video = host.querySelector<HTMLVideoElement>('.f1s-home__video')!
  video.src = homeBackgroundVideoUrl
  video.defaultMuted = true
  video.muted = true
  const retryPlayback = (): void => {
    void video.play().catch(() => { /* browser will retry after interaction */ })
  }
  retryPlayback()
  document.addEventListener('pointerdown', retryPlayback, { once: true })

  let destroyed = false
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    document.removeEventListener('pointerdown', retryPlayback)
    video.pause()
    video.removeAttribute('src')
    video.load()
    document.body.classList.remove('f1s-home-active')
    host.remove()
  }

  const startButton = host.querySelector<HTMLButtonElement>('.f1s-home__start')!
  startButton.addEventListener('click', () => {
    startButton.disabled = true
    startButton.textContent = '进入赛场'
    host.classList.add('f1s-home--launching')
    void Promise.resolve(onStart()).catch((error) => {
      console.warn('[F1S] background game preparation failed:', error)
    }).then(() => {
      host.classList.add('f1s-home--leaving')
      window.setTimeout(destroy, reduceMotion ? 0 : 300)
    })
  }, { once: true })

  return { destroy }
}

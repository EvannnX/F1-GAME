export interface TransitionVideoController {
  play: () => Promise<void>
  hide: () => void
}

export function createTransitionVideo(videoUrl: string): TransitionVideoController {
  let host: HTMLDivElement | null = null
  let video: HTMLVideoElement | null = null
  let finishCurrent: (() => void) | null = null

  const hide = (): void => {
    finishCurrent?.()
  }

  const play = (): Promise<void> => new Promise<void>((resolve) => {
    hide()
    host = document.createElement('div')
    host.style.cssText = `
      position:fixed;inset:0;z-index:190;background:#000;
      display:flex;align-items:center;justify-content:center;
    `
    video = document.createElement('video')
    video.src = videoUrl
    video.playsInline = true
    video.setAttribute('webkit-playsinline', 'true')
    video.preload = 'auto'
    video.controls = false
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000;'

    const skip = document.createElement('button')
    skip.type = 'button'
    skip.textContent = '跳过'
    skip.style.cssText = `
      position:absolute;right:max(20px,env(safe-area-inset-right));
      bottom:max(18px,env(safe-area-inset-bottom));z-index:2;
      border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.48);color:#fff;
      border-radius:6px;padding:8px 16px;font:700 13px/1 -apple-system,BlinkMacSystemFont,sans-serif;
      cursor:pointer;
    `
    host.append(video, skip)
    document.body.appendChild(host)

    let settled = false
    const watchdog = window.setTimeout(() => finish(), 12_000)
    const finish = (): void => {
      if (settled) return
      settled = true
      window.clearTimeout(watchdog)
      finishCurrent = null
      video?.pause()
      video?.removeEventListener('ended', finish)
      video?.removeEventListener('error', finish)
      skip.removeEventListener('click', finish)
      host?.remove()
      host = null
      video = null
      resolve()
    }
    finishCurrent = finish
    video.addEventListener('ended', finish)
    video.addEventListener('error', finish)
    skip.addEventListener('click', finish)

    video.muted = false
    video.play().catch(() => {
      if (!video || settled) return
      video.muted = true
      video.play().catch(finish)
    })
  })

  return { play, hide }
}

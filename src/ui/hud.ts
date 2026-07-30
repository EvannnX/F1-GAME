export interface HudController {
  show: () => void
  hide: () => void
  update: (data: {
    speedKmh: number
    lapMs: number
    mode: string
    gyroSource?: 'sensor' | 'mouse' | null
    position?: number
    fieldSize?: number
  }) => void
  flash: (msg: string, color?: string, ms?: number) => void
}

export function createHud(): HudController {
  let host: HTMLDivElement | null = null
  let speedEl: HTMLDivElement | null = null
  let flashEl: HTMLDivElement | null = null
  let flashTimer = 0

  const show = (): void => {
    hide()
    host = document.createElement('div')
    host.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 50;
      color: #fff; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `
    speedEl = document.createElement('div')
    speedEl.style.cssText = `
      position: absolute; right: max(24px, env(safe-area-inset-right));
      bottom: max(22px, env(safe-area-inset-bottom));
      font-size: clamp(38px, 5vw, 58px); font-weight: 900; letter-spacing: 0;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 3px 12px rgba(0,0,0,0.82);
    `
    flashEl = document.createElement('div')
    flashEl.style.cssText = `
      position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%);
      font-size: 80px; font-weight: 900; letter-spacing: 6px;
      opacity: 0; pointer-events: none;
      text-shadow: 0 4px 24px rgba(0,0,0,0.9);
      transition: opacity 0.15s ease;
    `
    host.appendChild(speedEl)
    host.appendChild(flashEl)
    document.body.appendChild(host)
  }

  const hide = (): void => {
    if (host && host.parentElement) host.parentElement.removeChild(host)
    host = null
    speedEl = null
    flashEl = null
  }

  const update = (data: {
    speedKmh: number
    lapMs: number
    mode: string
    gyroSource?: 'sensor' | 'mouse' | null
    position?: number
    fieldSize?: number
  }): void => {
    if (speedEl) speedEl.textContent = `${Math.round(data.speedKmh)} km/h`
    if (flashEl && flashTimer > 0) {
      flashTimer -= 16
      if (flashTimer <= 0) {
        flashEl.style.opacity = '0'
      }
    }
  }

  const flash = (msg: string, color = '#ff1801', ms = 1500): void => {
    if (!flashEl) return
    flashEl.textContent = msg
    flashEl.style.color = color
    flashEl.style.opacity = '1'
    flashTimer = ms
  }

  return { show, hide, update, flash }
}

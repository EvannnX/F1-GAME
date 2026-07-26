import { formatLapTime } from '../utils/math'
import { storage } from '../utils/storage'

export interface ResultController {
  show: (data: {
    lapMs: number
    topSpeedKmh: number
    crashes: number
    opponentHits: number
    position: number
    fieldSize: number
    isPB: boolean
    previousBestMs?: number | null
    onRestart: () => void
    onMenu: () => void
  }) => void
  hide: () => void
}

const HEADLINES: Record<number, { text: string; color: string }> = {
  1: { text: '🏆 P1 · 冠 军', color: '#ffd166' },
  2: { text: 'P2 · 亚 军', color: '#c0c0c0' },
  3: { text: 'P3 · 季 军', color: '#cd7f32' },
  4: { text: 'P4 · 完 赛', color: '#aaaaaa' },
}

function gradeFor(lapMs: number, crashes: number, opponentHits: number, position: number): string {
  let score = position === 1 ? 4 : position === 2 ? 3 : position === 3 ? 2 : 1
  if (crashes + opponentHits === 0) score++
  if (lapMs > 0 && lapMs < 105_000) score++
  return score >= 6 ? 'S' : score >= 5 ? 'A' : score >= 3 ? 'B' : 'C'
}

function drivingTitleFor(topSpeedKmh: number, crashes: number, opponentHits: number): string {
  const hits = crashes + opponentHits
  if (hits === 0 && topSpeedKmh >= 250) return '零失误极速猎手'
  if (hits === 0) return '稳健走线大师'
  if (topSpeedKmh >= 280) return '极限晚刹型车手'
  if (opponentHits >= 2) return '赛道进攻手'
  return '上海赛道挑战者'
}

export function createResult(): ResultController {
  let host: HTMLDivElement | null = null

  const hide = (): void => {
    host?.remove()
    host = null
  }

  const show = (data: Parameters<ResultController['show']>[0]): void => {
    hide()
    const head = HEADLINES[data.position] ?? { text: 'FINISH', color: '#ff1801' }
    const grade = gradeFor(data.lapMs, data.crashes, data.opponentHits, data.position)
    const driverTitle = drivingTitleFor(data.topSpeedKmh, data.crashes, data.opponentHits)
    const previousBest = data.previousBestMs ?? storage.getBestLap()
    const deltaMs = previousBest && data.lapMs > 0 ? data.lapMs - previousBest : null

    host = document.createElement('div')
    host.style.cssText = `
      position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(circle at 50% 20%,rgba(204,20,37,.28),transparent 38%),rgba(6,9,16,.96);
      color:#fff;padding:18px;flex-direction:column;gap:10px;box-sizing:border-box;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    `

    const gradeBadge = document.createElement('div')
    gradeBadge.textContent = grade
    gradeBadge.setAttribute('aria-label', `驾驶评级 ${grade}`)
    gradeBadge.style.cssText = `
      position:absolute;right:max(24px,6vw);top:max(20px,5vh);
      width:clamp(64px,10vw,94px);height:clamp(64px,10vw,94px);
      display:flex;align-items:center;justify-content:center;border:3px solid ${head.color};
      border-radius:50%;color:${head.color};font-size:clamp(38px,7vw,62px);font-weight:950;
      box-shadow:0 0 28px ${head.color}55;transform:rotate(5deg);
    `

    const title = document.createElement('div')
    title.textContent = head.text
    title.style.cssText = `font-size:clamp(26px,5vw,38px);font-weight:900;letter-spacing:6px;color:${head.color};`

    const sub = document.createElement('div')
    sub.style.cssText = 'font-size:14px;color:#ffb5bd;letter-spacing:3px;font-weight:800;'
    sub.textContent = data.isPB ? '🔥 全新个人最佳' : `${driverTitle} · 共 ${data.fieldSize} 名车手`

    const lap = document.createElement('div')
    lap.textContent = formatLapTime(data.lapMs)
    lap.style.cssText = 'font-size:clamp(48px,10vw,76px);font-weight:950;font-variant-numeric:tabular-nums;line-height:1;'

    const deltaText = deltaMs === null
      ? '首次挑战'
      : `${deltaMs <= 0 ? '−' : '+'}${formatLapTime(Math.abs(deltaMs))}`
    const stats = document.createElement('div')
    stats.style.cssText = 'display:flex;gap:24px;font-size:13px;color:#929aab;flex-wrap:wrap;justify-content:center;'
    stats.innerHTML = `
      <div>顶速 <span style="color:#fff;font-size:19px;font-weight:800">${Math.round(data.topSpeedKmh)}</span> km/h</div>
      <div>碰撞 <span style="color:#fff;font-size:19px;font-weight:800">${data.crashes + data.opponentHits}</span> 次</div>
      <div>历史最佳 <span style="color:#fff;font-size:19px;font-weight:800">${storage.getBestLap() ? formatLapTime(storage.getBestLap()!) : '—'}</span></div>
      <div>最佳差距 <span style="color:${deltaMs !== null && deltaMs <= 0 ? '#35e08b' : '#ffb347'};font-size:19px;font-weight:800">${deltaText}</span></div>
    `

    const shareHint = document.createElement('div')
    shareHint.textContent = '截下成绩卡，邀请好友挑战你的圈速'
    shareHint.style.cssText = 'font-size:12px;color:#8f98aa;letter-spacing:1px;text-align:center;'

    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;justify-content:center;'
    const makeButton = (text: string, css: string): HTMLButtonElement => {
      const button = document.createElement('button')
      button.textContent = text
      button.style.cssText = `min-width:140px;min-height:58px;border-radius:8px;font-size:17px;font-weight:850;letter-spacing:2px;cursor:pointer;${css}`
      return button
    }
    const restart = makeButton('再来一局', 'background:#ed1b2f;color:#fff;border:none;')
    restart.addEventListener('click', data.onRestart, { once: true })
    const share = makeButton('分享挑战', 'background:#fff;color:#111722;border:none;')
    share.addEventListener('click', () => {
      const text = `我在 F1TI 上海赛道跑出 ${formatLapTime(data.lapMs)}，获得 ${grade} 级「${driverTitle}」，敢来挑战吗？`
      try {
        if (navigator.share) {
          void navigator.share({ title: 'F1TI 赛车挑战', text }).catch(() => {})
        } else if (navigator.clipboard) {
          void navigator.clipboard.writeText(text).then(() => {
            share.textContent = '成绩已复制'
          }).catch(() => {
            share.textContent = '请截图分享'
          })
        } else {
          share.textContent = '请截图分享'
        }
      } catch {
        share.textContent = '请截图分享'
      }
    })
    const menu = makeButton('返回首页', 'background:transparent;color:#fff;border:2px solid #fff;')
    menu.addEventListener('click', data.onMenu, { once: true })
    buttons.append(restart, share, menu)

    host.append(gradeBadge, title, sub, lap, stats, shareHint, buttons)
    document.body.appendChild(host)
  }

  return { show, hide }
}

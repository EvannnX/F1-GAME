import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const cdpPort = Number(process.env.F1TI_CDP_PORT ?? 9223)
const appUrl = process.env.F1TI_CAPTURE_URL ?? 'http://127.0.0.1:5173/'
const outputDir = path.resolve(
  process.env.F1TI_CAPTURE_DIR ?? 'artifacts/f1ti-special-front',
)
const captureVariant = process.env.F1TI_CAPTURE_VARIANT ?? 'core'
const captureLimit = Math.max(1, Math.min(10, Number(process.env.F1TI_CAPTURE_LIMIT ?? 10)))
const views = [
  { yaw: -9, pitch: 7 },
  { yaw: -7, pitch: 8 },
  { yaw: -5, pitch: 9 },
  { yaw: -3, pitch: 7 },
  { yaw: -1, pitch: 8 },
  { yaw: 1, pitch: 8 },
  { yaw: 3, pitch: 7 },
  { yaw: 5, pitch: 9 },
  { yaw: 7, pitch: 8 },
  { yaw: 9, pitch: 7 },
].slice(0, captureLimit)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForCdp() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`)
      if (response.ok) return
    } catch {
      // Chrome is still starting.
    }
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint did not become ready')
}

async function createTarget() {
  const response = await fetch(
    `http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  )
  if (!response.ok) throw new Error(`Unable to create capture tab: ${response.status}`)
  return response.json()
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket.close()
  }
}

async function waitForCaptureReady(session) {
  for (let attempt = 0; attempt < 240; attempt++) {
    const result = await session.send('Runtime.evaluate', {
      expression: "document.body?.dataset.captureReady === 'true'",
      returnByValue: true,
    })
    if (result.result?.value === true) {
      await sleep(1200)
      return
    }
    await sleep(250)
  }
  throw new Error('Special livery did not finish loading within 60 seconds')
}

await mkdir(outputDir, { recursive: true })
await waitForCdp()
const target = await createTarget()
const session = new CdpSession(target.webSocketDebuggerUrl)
await session.connect()
await session.send('Page.enable')
await session.send('Runtime.enable')
await session.send('Emulation.setDeviceMetricsOverride', {
  width: 3840,
  height: 2160,
  deviceScaleFactor: 1,
  mobile: false,
})

for (let index = 0; index < views.length; index++) {
  const view = views[index]
  const url = new URL(appUrl)
  url.searchParams.set(
    'specialLiveryCapture',
    captureVariant === 'partners' ? 'partners' : '1',
  )
  url.searchParams.set('captureYaw', String(view.yaw))
  url.searchParams.set('capturePitch', String(view.pitch))
  await session.send('Page.navigate', { url: url.href })
  await waitForCaptureReady(session)
  const capture = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  })
  const filename = `f1ti_special_front_${String(index + 1).padStart(2, '0')}_4k.png`
  await writeFile(path.join(outputDir, filename), Buffer.from(capture.data, 'base64'))
  console.log(`${index + 1}/${views.length} ${filename}`)
}

session.close()

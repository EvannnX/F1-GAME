import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const previewUrl = new URL(
  '/src/assets/FOM赛车涂装贴花可复用包-v54/fom-decal-preview.html?export-decals=1',
  'http://127.0.0.1:5188',
).href
const target = await fetch(
  `http://127.0.0.1:9223/json/new?${encodeURIComponent(previewUrl)}`,
  { method: 'PUT' },
).then((response) => response.json())

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let commandId = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id) return
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
})

function command(method, params = {}) {
  const id = ++commandId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

await command('Runtime.enable')
const deadline = Date.now() + 120_000
while (Date.now() < deadline) {
  const ready = await command('Runtime.evaluate', {
    expression: 'typeof window.__exportFomV54Decals === "function"',
    returnByValue: true,
  })
  if (ready.result.value === true) break
  await new Promise((resolve) => setTimeout(resolve, 250))
}

const exported = await command('Runtime.evaluate', {
  expression: 'JSON.stringify(window.__exportFomV54Decals?.() ?? null)',
  returnByValue: true,
})
const value = exported.result.value
if (!value || value === 'null') {
  throw new Error('Timed out waiting for the original v54 decal geometry')
}
const original = JSON.parse(value)
const keyMap = {
  frontCreatorSymbol: 'creator-front',
  frontZjuap: 'zjuap-front',
  rear: 'rear',
  right: 'main-right',
  left: 'main-left',
  deltaRight: 'deltax-right',
  deltaLeft: 'deltax-left',
  sponsorDouyinRight: 'douyin-right',
  sponsorDouyinLeft: 'douyin-left',
  sponsorDownload3Right: 'sponsor-two-right',
  sponsorDownload3Left: 'sponsor-two-left',
  sponsorJointRight: 'joint-right',
  sponsorJointLeft: 'joint-left',
  sponsorBlueRight: 'blue-right',
  sponsorBlueLeft: 'blue-left',
  sponsorTraeRight: 'trae-right',
  sponsorTraeLeft: 'trae-left',
  sponsorJinqiuRight: 'jinqiu-right',
  sponsorJinqiuLeft: 'jinqiu-left',
}
const geometries = Object.fromEntries(
  Object.entries(keyMap).map(([sourceKey, targetKey]) => [
    targetKey,
    original[sourceKey],
  ]),
)
const output = JSON.stringify({
  version: 3,
  source: 'fom-v54-browser-raycaster-export',
  geometries,
})
const outputPath = resolve('src/generated/fom/decal-geometries.json')
await writeFile(outputPath, `${output}\n`)
socket.close()
console.log(`Exported original v54 decals to ${outputPath} (${output.length} bytes)`)

const MAP_W = 220
const MAP_H = 160
const PADDING = 12
const TRAIL_MAX = 520
const TRAIL_STEP_SQ = 4 * 4

export interface TelemetryMapPoint {
  x: number
  z: number
}

export interface TelemetryMapRoadTriangle {
  ax: number
  az: number
  bx: number
  bz: number
  cx: number
  cz: number
}

export interface TelemetryMapRoadMask {
  minX: number
  minZ: number
  cellSize: number
  cols: number
  rows: number
  bitsBase64: string
  placementX?: number
  placementZ?: number
  placementYawDeg?: number
  placementScale?: number
}

export interface TelemetryMapSource {
  routePoints?: TelemetryMapPoint[]
  roadTriangles?: TelemetryMapRoadTriangle[]
  roadMask?: TelemetryMapRoadMask
}

export interface TelemetryMapCar {
  x: number
  z: number
  heading?: number
  speedKmh?: number
  onRoad?: boolean
}

export interface TelemetryMapOpponent {
  x: number
  z: number
  color: string
}

export interface TelemetryMapController {
  show: () => void
  hide: () => void
  resetTrail: () => void
  update: (data: {
    player: TelemetryMapCar
    opponents?: TelemetryMapOpponent[]
  }) => void
  dispose: () => void
}

export function createTelemetryMap(source: TelemetryMapPoint[] | TelemetryMapSource): TelemetryMapController {
  const trackPoints = Array.isArray(source) ? source : (source.routePoints ?? [])
  const roadTriangles = Array.isArray(source) ? [] : (source.roadTriangles ?? [])
  const roadMask = Array.isArray(source) ? undefined : source.roadMask
  let host: HTMLDivElement | null = null
  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  const staticLayer = document.createElement('canvas')
  staticLayer.width = MAP_W
  staticLayer.height = MAP_H
  const staticCtx = staticLayer.getContext('2d')
  const trail: TelemetryMapPoint[] = []

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  const includeBoundsPoint = (x: number, z: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }

  for (const p of trackPoints) {
    includeBoundsPoint(p.x, p.z)
  }
  for (const tri of roadTriangles) {
    includeBoundsPoint(tri.ax, tri.az)
    includeBoundsPoint(tri.bx, tri.bz)
    includeBoundsPoint(tri.cx, tri.cz)
  }
  if (roadMask) {
    const rotation = (roadMask.placementYawDeg ?? 0) * Math.PI / 180
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const placementScale = roadMask.placementScale ?? 1
    const placementX = roadMask.placementX ?? 0
    const placementZ = roadMask.placementZ ?? 0
    const maxMaskX = roadMask.minX + roadMask.cols * roadMask.cellSize
    const maxMaskZ = roadMask.minZ + roadMask.rows * roadMask.cellSize
    for (const [x, z] of [
      [roadMask.minX, roadMask.minZ], [maxMaskX, roadMask.minZ],
      [maxMaskX, maxMaskZ], [roadMask.minX, maxMaskZ],
    ]) {
      includeBoundsPoint(
        placementX + (x * cos + z * sin) * placementScale,
        placementZ + (-x * sin + z * cos) * placementScale,
      )
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
    minX = -100
    maxX = 100
    minZ = -100
    maxZ = 100
  }
  const worldW = maxX - minX || 1
  const worldH = maxZ - minZ || 1
  const fitW = MAP_W - PADDING * 2
  const fitH = MAP_H - PADDING * 2 - 18
  const scale = Math.min(fitW / worldW, fitH / worldH)
  const offX = PADDING + (fitW - worldW * scale) / 2 - minX * scale
  const offY = PADDING + 18 + (fitH - worldH * scale) / 2 - minZ * scale

  const project = (x: number, z: number): [number, number] => [
      x * scale + offX,
    z * scale + offY,
  ]

  const drawRoadTriangles = (): void => {
    if (!staticCtx || roadTriangles.length < 1) return
    staticCtx.fillStyle = 'rgba(255,255,255,0.9)'
    staticCtx.beginPath()
    for (const tri of roadTriangles) {
      const [ax, ay] = project(tri.ax, tri.az)
      const [bx, by] = project(tri.bx, tri.bz)
      const [cx, cy] = project(tri.cx, tri.cz)
      staticCtx.moveTo(ax, ay)
      staticCtx.lineTo(bx, by)
      staticCtx.lineTo(cx, cy)
      staticCtx.closePath()
    }
    staticCtx.fill()
  }

  const drawRoadMask = (): void => {
    if (!staticCtx || !roadMask) return
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = roadMask.cols
    maskCanvas.height = roadMask.rows
    const maskContext = maskCanvas.getContext('2d')
    if (!maskContext) return
    const image = maskContext.createImageData(roadMask.cols, roadMask.rows)
    const binary = atob(roadMask.bitsBase64)
    for (let index = 0; index < roadMask.cols * roadMask.rows; index++) {
      if (!(binary.charCodeAt(index >> 3) & (1 << (index & 7)))) continue
      const pixel = index * 4
      image.data[pixel] = 255
      image.data[pixel + 1] = 255
      image.data[pixel + 2] = 255
      image.data[pixel + 3] = 242
    }
    maskContext.putImageData(image, 0, 0)

    const rotation = (roadMask.placementYawDeg ?? 0) * Math.PI / 180
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const placementScale = roadMask.placementScale ?? 1
    const pixelScale = roadMask.cellSize * placementScale * scale
    const placementX = roadMask.placementX ?? 0
    const placementZ = roadMask.placementZ ?? 0
    const originX = placementX + (roadMask.minX * cos + roadMask.minZ * sin) * placementScale
    const originZ = placementZ + (-roadMask.minX * sin + roadMask.minZ * cos) * placementScale
    staticCtx.save()
    staticCtx.imageSmoothingEnabled = true
    staticCtx.setTransform(
      cos * pixelScale,
      -sin * pixelScale,
      sin * pixelScale,
      cos * pixelScale,
      originX * scale + offX,
      originZ * scale + offY,
    )
    staticCtx.drawImage(maskCanvas, 0, 0)
    staticCtx.restore()
  }

  const drawRouteLineFallback = (): void => {
    if (!staticCtx || trackPoints.length <= 1) return
    for (const pass of [
      { stroke: 'rgba(0,0,0,0.78)', width: 9 },
      { stroke: 'rgba(255,255,255,0.96)', width: 5.5 },
    ]) {
      staticCtx.strokeStyle = pass.stroke
      staticCtx.lineWidth = pass.width
      staticCtx.lineCap = 'round'
      staticCtx.lineJoin = 'round'
      staticCtx.beginPath()
      const first = project(trackPoints[0].x, trackPoints[0].z)
      const second = project(trackPoints[1].x, trackPoints[1].z)
      staticCtx.moveTo((first[0] + second[0]) * 0.5, (first[1] + second[1]) * 0.5)
      for (let i = 1; i <= trackPoints.length; i++) {
        const current = trackPoints[i % trackPoints.length]
        const next = trackPoints[(i + 1) % trackPoints.length]
        const [cx, cy] = project(current.x, current.z)
        const [nx, ny] = project(next.x, next.z)
        staticCtx.quadraticCurveTo(cx, cy, (cx + nx) * 0.5, (cy + ny) * 0.5)
      }
      staticCtx.closePath()
      staticCtx.stroke()
    }
  }

  const drawStatic = (): void => {
    if (!staticCtx) return
    staticCtx.clearRect(0, 0, MAP_W, MAP_H)
    staticCtx.fillStyle = 'rgba(5, 9, 16, 0.72)'
    staticCtx.beginPath()
    staticCtx.roundRect(0, 0, MAP_W, MAP_H, 8)
    staticCtx.fill()

    if (roadMask) {
      drawRoadMask()
    } else if (roadTriangles.length > 0) {
      drawRoadTriangles()
    } else {
      drawRouteLineFallback()
    }

    if (trackPoints.length > 0) {
      const start = trackPoints[0]
      const [sx, sy] = project(start.x, start.z)
      staticCtx.fillStyle = '#25f4ee'
      staticCtx.beginPath()
      staticCtx.arc(sx, sy, 3, 0, Math.PI * 2)
      staticCtx.fill()
    }

    staticCtx.fillStyle = 'rgba(37,244,238,0.95)'
    staticCtx.font = '700 10px -apple-system, BlinkMacSystemFont, sans-serif'
    staticCtx.fillText('TELEMETRY', 10, 14)
  }

  const drawDot = (x: number, z: number, color: string, r: number, stroke = '#05070c'): void => {
    if (!ctx) return
    const [px, py] = project(x, z)
    ctx.fillStyle = color
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  const draw = (player: TelemetryMapCar, opponents: TelemetryMapOpponent[] = []): void => {
    if (!ctx) return
    ctx.clearRect(0, 0, MAP_W, MAP_H)
    ctx.drawImage(staticLayer, 0, 0)

    const last = trail[trail.length - 1]
    if (!last || (player.x - last.x) ** 2 + (player.z - last.z) ** 2 > TRAIL_STEP_SQ) {
      trail.push({ x: player.x, z: player.z })
      if (trail.length > TRAIL_MAX) trail.shift()
    }

    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(37,244,238,0.72)'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let i = 0; i < trail.length; i++) {
        const [px, py] = project(trail[i].x, trail[i].z)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    for (const opp of opponents) {
      drawDot(opp.x, opp.z, opp.color, 3.5)
    }

    const [px, py] = project(player.x, player.z)
    drawDot(player.x, player.z, '#ffffff', 5, '#ff1801')
    if (player.heading !== undefined) {
      const len = 13
      const dx = Math.sin(player.heading) * len
      const dy = Math.cos(player.heading) * len
      ctx.strokeStyle = '#ff1801'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + dx, py + dy)
      ctx.stroke()
    }

  }

  drawStatic()

  const show = (): void => {
    if (host) return
    host = document.createElement('div')
    host.style.cssText = `
      position: fixed; right: 16px; top: 72px; z-index: 58;
      pointer-events: none;
      filter: drop-shadow(0 5px 14px rgba(0,0,0,0.58));
    `
    canvas = document.createElement('canvas')
    canvas.width = MAP_W
    canvas.height = MAP_H
    canvas.style.cssText = `
      display: block;
      width: ${MAP_W}px;
      height: ${MAP_H}px;
    `
    ctx = canvas.getContext('2d')
    host.appendChild(canvas)
    document.body.appendChild(host)
  }

  const hide = (): void => {
    if (host?.parentElement) host.parentElement.removeChild(host)
    host = null
    canvas = null
    ctx = null
  }

  const resetTrail = (): void => {
    trail.length = 0
  }

  const update = (data: {
    player: TelemetryMapCar
    opponents?: TelemetryMapOpponent[]
  }): void => {
    if (!ctx) return
    draw(data.player, data.opponents ?? [])
  }

  return { show, hide, resetTrail, update, dispose: hide }
}

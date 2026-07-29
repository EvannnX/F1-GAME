import * as THREE from 'three'
import {
  AUDI_LIVERY_TEMPLATE,
  type AudiSideProjectorTemplate,
} from '../data/audiLiveryTemplate'

export interface LiveryPalette {
  primary: string
  secondary: string
  accent: string
  light: string
  dark: string
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function luminance(color: [number, number, number]): number {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
}

export function extractLiveryPalette(image: HTMLImageElement): LiveryPalette {
  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return {
      primary: '#d41222',
      secondary: '#292c34',
      accent: '#ff5a68',
      light: '#f4f4f1',
      dark: '#101116',
    }
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const buckets = new Map<string, { color: [number, number, number]; count: number }>()
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 80) continue
    const color: [number, number, number] = [
      Math.min(255, Math.round(pixels[index] / 32) * 32),
      Math.min(255, Math.round(pixels[index + 1] / 32) * 32),
      Math.min(255, Math.round(pixels[index + 2] / 32) * 32),
    ]
    const key = color.join(':')
    const bucket = buckets.get(key)
    if (bucket) bucket.count++
    else buckets.set(key, { color, count: 1 })
  }
  const colors = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ color }) => color)
  const primary = colors[0] ?? [212, 18, 34]
  const dark = [...colors].sort((a, b) => luminance(a) - luminance(b))[0] ?? [16, 17, 22]
  const light = [...colors].sort((a, b) => luminance(b) - luminance(a))[0] ?? [244, 244, 241]
  const accent = colors.find((color) =>
    Math.max(...color) - Math.min(...color) > 80,
  ) ?? primary
  return {
    primary: toHex(...primary),
    secondary: toHex(...(colors[1] ?? dark)),
    accent: toHex(...accent),
    light: toHex(...light),
    dark: toHex(...dark),
  }
}

function drawContained(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const sample = document.createElement('canvas')
  const sampleScale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight))
  sample.width = Math.max(1, Math.round(image.naturalWidth * sampleScale))
  sample.height = Math.max(1, Math.round(image.naturalHeight * sampleScale))
  const sampleContext = sample.getContext('2d', { willReadFrequently: true })
  sampleContext?.drawImage(image, 0, 0, sample.width, sample.height)
  const pixels = sampleContext?.getImageData(0, 0, sample.width, sample.height).data
  let minX = sample.width
  let minY = sample.height
  let maxX = -1
  let maxY = -1
  if (pixels) {
    for (let pixelY = 0; pixelY < sample.height; pixelY++) {
      for (let pixelX = 0; pixelX < sample.width; pixelX++) {
        const index = (pixelY * sample.width + pixelX) * 4
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
        const brightness = (red + green + blue) / 3
        if (pixels[index + 3] < 40 || (chroma < 22 && brightness > 218)) continue
        minX = Math.min(minX, pixelX)
        minY = Math.min(minY, pixelY)
        maxX = Math.max(maxX, pixelX)
        maxY = Math.max(maxY, pixelY)
      }
    }
  }
  const hasSubject = maxX >= minX && maxY >= minY
  const sourceX = hasSubject ? minX / sampleScale : 0
  const sourceY = hasSubject ? minY / sampleScale : 0
  const sourceWidth = hasSubject ? (maxX - minX + 1) / sampleScale : image.naturalWidth
  const sourceHeight = hasSubject ? (maxY - minY + 1) / sampleScale : image.naturalHeight
  const scale = Math.min(width / sourceWidth, height / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )
}

function drawSpeedStripes(
  context: CanvasRenderingContext2D,
  side: AudiSideProjectorTemplate,
  palette: LiveryPalette,
  width: number,
  height: number,
): void {
  const direction = side.name === 'left' ? 1 : -1
  context.save()
  context.translate(width / 2, height / 2)
  context.scale(direction, 1)
  context.rotate(-Math.PI / 16)
  context.fillStyle = palette.primary
  context.fillRect(-width * 0.7, -height * 0.43, width * 1.4, height * 0.13)
  context.fillStyle = palette.accent
  context.fillRect(-width * 0.7, height * 0.31, width * 1.4, height * 0.055)
  context.fillStyle = palette.dark
  context.fillRect(-width * 0.7, height * 0.41, width * 1.4, height * 0.035)
  context.restore()
}

export function createSideLiveryTexture(
  image: HTMLImageElement,
  side: AudiSideProjectorTemplate,
): THREE.CanvasTexture {
  const width = AUDI_LIVERY_TEMPLATE.textureWidth
  const height = AUDI_LIVERY_TEMPLATE.textureHeight
  const palette = extractLiveryPalette(image)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法生成左右车衣设计图')

  context.clearRect(0, 0, width, height)
  const direction = side.name === 'left' ? 1 : -1
  context.save()
  context.translate(direction === 1 ? 0 : width, 0)
  context.scale(direction, 1)
  context.beginPath()
  context.moveTo(width * 0.03, height * 0.31)
  context.lineTo(width * 0.18, height * 0.08)
  context.lineTo(width * 0.84, height * 0.03)
  context.lineTo(width * 0.98, height * 0.25)
  context.lineTo(width * 0.88, height * 0.86)
  context.lineTo(width * 0.2, height * 0.96)
  context.lineTo(width * 0.02, height * 0.72)
  context.closePath()
  context.clip()

  const gradient = context.createLinearGradient(
    0,
    0,
    width,
    height,
  )
  gradient.addColorStop(0, palette.secondary)
  gradient.addColorStop(0.48, palette.light)
  gradient.addColorStop(1, palette.primary)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  drawSpeedStripes(context, side, palette, width, height)

  const safe = AUDI_LIVERY_TEMPLATE.subjectSafeZone
  const safeX = safe.x * width
  const safeY = safe.y * height
  const safeWidth = safe.width * width
  const safeHeight = safe.height * height
  context.fillStyle = 'rgba(255, 255, 255, .68)'
  context.beginPath()
  context.roundRect(safeX, safeY, safeWidth, safeHeight, 54)
  context.fill()
  context.strokeStyle = palette.accent
  context.lineWidth = 10
  context.stroke()
  drawContained(
    context,
    image,
    safeX + 16,
    safeY + 14,
    safeWidth - 32,
    safeHeight - 28,
  )
  context.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function createAccentLiveryTexture(
  image: HTMLImageElement,
  name: 'nose' | 'engine' | 'tail',
): THREE.CanvasTexture {
  const width = 1024
  const height = 512
  const palette = extractLiveryPalette(image)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法生成车头车尾车衣')

  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, palette.dark)
  gradient.addColorStop(0.46, palette.primary)
  gradient.addColorStop(1, palette.accent)
  context.fillStyle = gradient
  context.beginPath()
  if (name === 'nose') {
    context.moveTo(width * 0.48, 0)
    context.lineTo(width, height * 0.42)
    context.lineTo(width * 0.76, height)
    context.lineTo(width * 0.25, height)
    context.lineTo(0, height * 0.42)
  } else {
    context.moveTo(width * 0.08, height * 0.08)
    context.lineTo(width * 0.92, 0)
    context.lineTo(width, height * 0.72)
    context.lineTo(width * 0.76, height)
    context.lineTo(width * 0.12, height * 0.9)
    context.lineTo(0, height * 0.35)
  }
  context.closePath()
  context.fill()

  context.strokeStyle = palette.light
  context.lineWidth = name === 'nose' ? 34 : 26
  context.beginPath()
  context.moveTo(width * 0.12, height * 0.72)
  context.lineTo(width * 0.54, height * 0.18)
  context.lineTo(width * 0.92, height * 0.5)
  context.stroke()
  context.strokeStyle = palette.accent
  context.lineWidth = 13
  context.beginPath()
  context.moveTo(width * 0.08, height * 0.86)
  context.lineTo(width * 0.55, height * 0.3)
  context.lineTo(width * 0.96, height * 0.62)
  context.stroke()

  const markSize = name === 'engine' ? height * 0.54 : height * 0.38
  drawContained(
    context,
    image,
    width * 0.5 - markSize * 0.5,
    height * 0.5 - markSize * 0.5,
    markSize,
    markSize,
  )

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const OFFLINE_PACKAGE = import.meta.env.VITE_F1TI_OFFLINE_8M === '1'

type OfflineAssetScope = typeof globalThis & {
  __F1TI_ASSET_IMAGE_URLS__?: Record<string, string>
  __F1TI_ASSET_LOADS__?: Partial<Record<string, Promise<ArrayBuffer>>>
  __F1TI_ASSET_DECODE_QUEUE__?: Promise<void>
  __F1TI_DRACO_DECODER__?: string
}

function decodeDataUrl(url: string): ArrayBuffer {
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma < 0) throw new Error('Offline asset is not embedded')

  const metadata = url.slice(5, comma)
  const payload = url.slice(comma + 1)
  if (!metadata.endsWith(';base64')) {
    return new TextEncoder().encode(decodeURIComponent(payload)).buffer
  }

  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

function decodeAssetImage(url: string, key: string): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas 2D is unavailable')
        context.drawImage(image, 0, 0)
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
        const byteAt = (index: number): number => {
          const pixel = Math.floor(index / 3)
          return rgba[pixel * 4 + (index % 3)]
        }
        const length = ((byteAt(0) << 24) | (byteAt(1) << 16) | (byteAt(2) << 8) | byteAt(3)) >>> 0
        if (length < 12 || length > canvas.width * canvas.height * 3 - 4) {
          throw new Error(`Offline asset length is invalid: ${key}`)
        }
        const bytes = new Uint8Array(length)
        for (let index = 0; index < length; index++) bytes[index] = byteAt(index + 4)
        const auxiliaryOffset = length + 4
        if (key === 'shanghai' && auxiliaryOffset + 4 <= canvas.width * canvas.height * 3) {
          const auxiliaryLength = (
            (byteAt(auxiliaryOffset) << 24) |
            (byteAt(auxiliaryOffset + 1) << 16) |
            (byteAt(auxiliaryOffset + 2) << 8) |
            byteAt(auxiliaryOffset + 3)
          ) >>> 0
          if (auxiliaryLength > 0 && auxiliaryOffset + 4 + auxiliaryLength <= canvas.width * canvas.height * 3) {
            const auxiliary = new Uint8Array(auxiliaryLength)
            for (let index = 0; index < auxiliaryLength; index++) {
              auxiliary[index] = byteAt(auxiliaryOffset + 4 + index)
            }
            ;(globalThis as OfflineAssetScope).__F1TI_DRACO_DECODER__ =
              new TextDecoder().decode(auxiliary)
          }
        }
        canvas.width = 1
        canvas.height = 1
        if (bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) {
          throw new Error(`Offline GLB signature is invalid: ${key}`)
        }
        resolve(bytes.buffer)
      } catch (error) {
        reject(error)
      }
    }, { once: true })
    image.addEventListener('error', () => reject(new Error(`Offline asset image failed: ${key}`)), { once: true })
    image.src = url
  })
}

async function loadPackagedAsset(key: string): Promise<ArrayBuffer> {
  const scope = globalThis as OfflineAssetScope
  const loads = scope.__F1TI_ASSET_LOADS__ ??= Object.create(null) as Partial<Record<string, Promise<ArrayBuffer>>>
  const existing = loads[key]
  if (existing) return existing

  const url = scope.__F1TI_ASSET_IMAGE_URLS__?.[key]
  if (!url) throw new Error(`Offline asset manifest is missing: ${key}`)
  let resolveAsset!: (value: ArrayBuffer) => void
  let rejectAsset!: (reason?: unknown) => void
  const pending = new Promise<ArrayBuffer>((resolve, reject) => {
    resolveAsset = resolve
    rejectAsset = reject
  })
  loads[key] = pending
  const previous = scope.__F1TI_ASSET_DECODE_QUEUE__ ?? Promise.resolve()
  scope.__F1TI_ASSET_DECODE_QUEUE__ = previous.then(async () => {
    try {
      resolveAsset(await decodeAssetImage(url, key))
    } catch (error) {
      delete loads[key]
      rejectAsset(error)
    }
  })
  return pending
}

export async function loadLocalAsset(url: string): Promise<ArrayBuffer> {
  if (OFFLINE_PACKAGE) {
    return url.startsWith('f1ti-asset:')
      ? loadPackagedAsset(url.slice('f1ti-asset:'.length))
      : decodeDataUrl(url)
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Asset request failed: ${response.status}`)
  return response.arrayBuffer()
}

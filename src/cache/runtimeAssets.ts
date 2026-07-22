import { COMMENTARY_ASSET_URLS } from '../audio/commentary'
import { LOW_POLY_SHANGHAI_RUNTIME_URLS } from '../render/lowPolyShanghai'

const RUNTIME_ASSET_URLS = [
  ...LOW_POLY_SHANGHAI_RUNTIME_URLS.slice(1),
  'video/beginning.mp4',
  'fibi.webp',
  ...COMMENTARY_ASSET_URLS,
]

let warmupPromise: Promise<void> | null = null

export function warmRuntimeAssetCache(): Promise<void> {
  if (warmupPromise) return warmupPromise

  warmupPromise = (async () => {
    const queue = [...new Set(RUNTIME_ASSET_URLS)]
    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const relativeUrl = queue.shift()
        if (!relativeUrl) return
        try {
          const response = await fetch(new URL(relativeUrl, document.baseURI), {
            cache: 'force-cache',
            credentials: 'same-origin',
          })
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
          await response.arrayBuffer()
        } catch (error) {
          console.warn('[F1S] runtime cache warmup skipped:', relativeUrl, error)
        }
      }
    }

    await Promise.all(Array.from({ length: 4 }, () => worker()))
  })()

  return warmupPromise
}

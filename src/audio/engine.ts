import engineUrl from '../assets/audio/engine.mp3?url'
import bgmUrl from '../assets/audio/Don Toliver - Lose My Mind (feat. Doja Cat) [From F1® The Movie] [Official Audio].mp3?url'

/** Looping engine sample whose volume + playback rate scale with throttle/speed,
 *  plus a constant-volume BGM track. Both are local files inside the ZIP. */
export interface AudioRig {
  prepare: () => void
  start: () => void
  stop: () => void
  setEngine: (throttle01: number, speed01: number) => void
  setBgmVolume: (v: number) => void
  destroy: () => void
}

export async function createAudioRig(): Promise<AudioRig> {
  const createLoop = (url: string): HTMLAudioElement => {
    const audio = document.createElement('audio')
    audio.src = url
    audio.loop = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    return audio
  }
  const engine = createLoop(engineUrl)
  const bgm = createLoop(bgmUrl)
  engine.volume = 0
  bgm.volume = 0
  let bgmVolume = 0.9
  let audible = false
  let prepared = false
  let startLogged = false
  let lastEngineUpdate = 0
  let lastEngineVolume = 0

  const play = (audio: HTMLAudioElement, label: string): void => {
    try {
      const result = audio.play()
      void result.catch((error) => {
        console.warn(`[F1S] ${label} play failed`, error)
      })
    } catch (error) {
      console.warn(`[F1S] ${label} play failed`, error)
    }
  }

  const prepare = (): void => {
    if (prepared) return
    prepared = true
    // Prime both local media elements while the menu click still carries a
    // user gesture, then pause at time zero. This unlocks mobile playback
    // without letting the song advance silently behind the intro video.
    for (const [audio, label] of [[engine, 'engine'], [bgm, 'bgm']] as const) {
      audio.volume = 0
      try {
        const priming = audio.play()
        void priming.then(() => {
          if (audible) return
          audio.pause()
          try {
            audio.currentTime = 0
          } catch {
            /* metadata may not be ready yet */
          }
        }).catch((error) => {
          console.warn(`[F1S] ${label} prime failed`, error)
        })
      } catch (error) {
        console.warn(`[F1S] ${label} prime failed`, error)
      }
    }
  }

  const start = (): void => {
    if (!prepared) prepare()
    audible = true
    // Countdown owns the audible start. Always begin both loops from zero
    // here, after the transition video has finished.
    try {
      engine.currentTime = 0
      bgm.currentTime = 0
    } catch {
      /* metadata may finish loading during play() */
    }
    bgm.volume = bgmVolume
    engine.volume = 0.08
    play(engine, 'engine')
    play(bgm, 'bgm')
    if (!startLogged) {
      startLogged = true
      console.log('[F1S][audio] local engine and bgm started')
    }
  }

  const setEngine = (throttle01: number, speed01: number): void => {
    if (!audible) return
    const now = performance.now()
    if (now - lastEngineUpdate < 80) return
    lastEngineUpdate = now
    const throttle = Math.max(0, Math.min(1, throttle01))
    const speed = Math.max(0, Math.min(1, speed01))
    // Pedal input owns the mix: quiet idle when released, immediate roar
    // while accelerating. Avoid changing media properties every frame,
    // which causes audible chopping in mobile WebViews.
    const targetVolume = Math.min(1, 0.07 + throttle * 0.82 + speed * 0.1)
    if (Math.abs(targetVolume - lastEngineVolume) > 0.015) {
      engine.volume = targetVolume
      lastEngineVolume = targetVolume
    }
    if (engine.paused && throttle > 0.02) play(engine, 'engine')
  }

  const setBgmVolume = (v: number): void => {
    bgmVolume = Math.max(0, Math.min(1, v))
    if (audible) bgm.volume = bgmVolume
  }

  const stop = (): void => {
    audible = false
    engine.pause()
    bgm.pause()
    engine.volume = 0
    bgm.volume = 0
    lastEngineVolume = 0
    try {
      engine.currentTime = 0
      bgm.currentTime = 0
    } catch {
      /* metadata may not be available yet */
    }
  }

  const destroy = (): void => {
    stop()
    engine.removeAttribute('src')
    bgm.removeAttribute('src')
    engine.load()
    bgm.load()
  }

  return { prepare, start, stop, setEngine, setBgmVolume, destroy }
}

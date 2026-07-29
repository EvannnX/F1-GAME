import engineUrl from '../assets/audio/engine.mp3?url'
import bgmUrl from '../assets/audio/Don Toliver - Lose My Mind (feat. Doja Cat) [From F1® The Movie] [Official Audio].mp3?url'
import lionRaceBgmUrl from '../assets/audio/lion-super-affection-instrumental.mp3?url'
import lionFinishBgmUrl from '../assets/audio/lion-super-affection-finish.mp3?url'
import { loadLocalAsset } from '../utils/localAsset'

export type BgmTrackId = 'default' | 'lion-race' | 'lion-finish'

/** Looping engine sample whose volume + playback rate scale with throttle/speed,
 *  plus cross-faded BGM tracks. Music uses media elements so a three-minute
 *  song is not retained as a 70+ MB decoded AudioBuffer. */
export interface AudioRig {
  start: () => void
  setEngine: (throttle01: number, speed01: number) => void
  setBgmTrack: (track: BgmTrackId, transitionSeconds?: number) => void
  setBgmVolume: (v: number, transitionSeconds?: number) => void
  getBgmState: () => {
    selected: BgmTrackId
    active: BgmTrackId | null
    started: boolean
    context: AudioContextState
    playing: boolean
    currentTime: number
  }
  destroy: () => void
}

export async function createAudioRig(): Promise<AudioRig> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()
  // createAudioRig() is normally entered directly from the first pointer
  // gesture. Resume before the first await so mobile Safari/WebView keeps
  // the browser's user-activation permission while assets decode.
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {})
  }

  const fetchBuffer = async (url: string): Promise<AudioBuffer | null> => {
    try {
      const buf = await loadLocalAsset(url)
      return await ctx.decodeAudioData(buf)
    } catch (e) {
      console.warn('[F1S] audio decode failed for', url, e)
      return null
    }
  }

  const engineBuf = await fetchBuffer(engineUrl)

  // ---- Engine: looping AudioBufferSourceNode + dedicated gain.
  const engineGain = ctx.createGain()
  engineGain.gain.value = 0
  engineGain.connect(ctx.destination)
  // Leave more room for the music and Saber voice. The old full-throttle
  // value of 1.0 dominated the mix, especially once several low-frequency
  // engine harmonics built up.
  const engineOutputLevel = 0.62

  let engineSource: AudioBufferSourceNode | null = null

  const startEngine = (): void => {
    if (!engineBuf || engineSource) return
    engineSource = ctx.createBufferSource()
    engineSource.buffer = engineBuf
    engineSource.loop = true
    engineSource.connect(engineGain)
    try {
      engineSource.start()
    } catch (e) {
      console.warn('[F1S] engine start failed', e)
    }
  }

  // ---- BGM: master gain (voice ducking) plus cross-faded track sources.
  //
  // FFmpeg EBU R128 measured the instrumental at -8.5 LUFS and the finish
  // edit at -14.0 LUFS. Reducing the instrumental by 5.5 dB equalises their
  // perceived loudness without boosting the finish track into clipping.
  const bgmUrls: Record<BgmTrackId, string> = {
    default: bgmUrl,
    'lion-race': lionRaceBgmUrl,
    'lion-finish': lionFinishBgmUrl,
  }
  const bgmTrackLevels: Record<BgmTrackId, number> = {
    default: 1,
    'lion-race': 10 ** (-5.5 / 20),
    'lion-finish': 1,
  }
  const bgmGain = ctx.createGain()
  bgmGain.gain.value = 0.8
  bgmGain.connect(ctx.destination)
  let selectedBgmTrack: BgmTrackId = 'default'
  let activeBgm: {
    track: BgmTrackId
    element: HTMLAudioElement
    source: MediaElementAudioSourceNode
    gain: GainNode
  } | null = null
  let started = false

  const releaseBgm = (bgm: NonNullable<typeof activeBgm>): void => {
    bgm.element.pause()
    bgm.element.removeAttribute('src')
    bgm.element.load()
    bgm.source.disconnect()
    bgm.gain.disconnect()
  }

  const startBgmSource = (
    track: BgmTrackId,
    fadeSeconds = 0,
  ): typeof activeBgm => {
    const element = new Audio(bgmUrls[track])
    element.loop = true
    element.preload = 'auto'
    element.playsInline = true
    const source = ctx.createMediaElementSource(element)
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(bgmGain)
    const targetLevel = bgmTrackLevels[track]
    const now = ctx.currentTime
    gain.gain.setValueAtTime(fadeSeconds > 0 ? 0 : targetLevel, now)
    if (fadeSeconds > 0) gain.gain.linearRampToValueAtTime(targetLevel, now + fadeSeconds)
    void element.play().catch((e) => {
      // A later pointer/key gesture calls start() again and retries playback.
      console.warn('[F1S] bgm start deferred until audio unlock', e)
    })
    return { track, element, source, gain }
  }

  const startBgm = (): void => {
    if (activeBgm) {
      void activeBgm.element.play().catch(() => {})
      return
    }
    activeBgm = startBgmSource(selectedBgmTrack)
  }

  const start = (): void => {
    started = true
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
    startEngine()
    startBgm()
  }

  const setEngine = (throttle01: number, speed01: number): void => {
    if (!engineSource) return
    // Volume swells with throttle: idle ≈ 0.25, full throttle = 1.0.
    // Pressing the accelerator (throttle > 0.7) snaps to a louder mix.
    const accel = throttle01 > 0.7
    const targetVol = (accel ? 1.0 : 0.25 + speed01 * 0.4) * engineOutputLevel
    engineGain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.05)
    // Pitch with speed (0.7× idle → 1.6× redline)
    const targetRate = 0.7 + speed01 * 0.9
    engineSource.playbackRate.setTargetAtTime(targetRate, ctx.currentTime, 0.05)
  }

  const setBgmTrack = (track: BgmTrackId, transitionSeconds = 0.48): void => {
    selectedBgmTrack = track
    if (!started || activeBgm?.track === track) return
    const duration = Math.max(0.04, transitionSeconds)
    const previous = activeBgm
    const next = startBgmSource(track, duration)
    if (!next) return
    activeBgm = next
    if (!previous) return
    const now = ctx.currentTime
    previous.gain.gain.cancelScheduledValues(now)
    previous.gain.gain.setValueAtTime(previous.gain.gain.value, now)
    previous.gain.gain.linearRampToValueAtTime(0, now + duration)
    window.setTimeout(() => releaseBgm(previous), (duration + 0.08) * 1000)
  }

  const setBgmVolume = (v: number, transitionSeconds = 0.1): void => {
    bgmGain.gain.setTargetAtTime(v, ctx.currentTime, Math.max(0.01, transitionSeconds))
  }

  const getBgmState = () => ({
    selected: selectedBgmTrack,
    active: activeBgm?.track ?? null,
    started,
    context: ctx.state,
    playing: activeBgm ? !activeBgm.element.paused : false,
    currentTime: activeBgm ? Number(activeBgm.element.currentTime.toFixed(2)) : 0,
  })

  const destroy = (): void => {
    try {
      engineSource?.stop()
    } catch {
      /* noop */
    }
    if (activeBgm) releaseBgm(activeBgm)
    void ctx.close().catch(() => {})
  }

  return { start, setEngine, setBgmTrack, setBgmVolume, getBgmState, destroy }
}

import engineUrl from '../assets/audio/engine.mp3?url'

/** Looping engine sample whose volume + playback rate scale with throttle/speed. */
export interface AudioRig {
  start: () => void
  setEngine: (throttle01: number, speed01: number) => void
  setBgmVolume: (v: number) => void
  destroy: () => void
}

export async function createAudioRig(): Promise<AudioRig> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()

  const fetchBuffer = async (url: string): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(url)
      const buf = await res.arrayBuffer()
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

  const start = (): void => {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
    startEngine()
  }

  const setEngine = (throttle01: number, speed01: number): void => {
    if (!engineSource) return
    // Volume swells with throttle: idle ≈ 0.25, full throttle = 1.0.
    // Pressing the accelerator (throttle > 0.7) snaps to a louder mix.
    const accel = throttle01 > 0.7
    const targetVol = accel ? 1.0 : 0.25 + speed01 * 0.4
    engineGain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.05)
    // Pitch with speed (0.7× idle → 1.6× redline)
    const targetRate = 0.7 + speed01 * 0.9
    engineSource.playbackRate.setTargetAtTime(targetRate, ctx.currentTime, 0.05)
  }

  const setBgmVolume = (_v: number): void => { /* submission build has no licensed BGM */ }

  const destroy = (): void => {
    try {
      engineSource?.stop()
    } catch {
      /* noop */
    }
    void ctx.close().catch(() => {})
  }

  return { start, setEngine, setBgmVolume, destroy }
}

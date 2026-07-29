export type TickFn = (dt: number, now: number) => void

export class GameLoop {
  private rafId: number | null = null
  private lastTime = 0
  private lastFrameTime = 0
  private frameAccumulatorMs = 0
  private readonly maxDt = 1 / 30
  private readonly targetFrameMs: number
  private readonly tick: TickFn

  constructor(tick: TickFn, maxFps = 60) {
    this.tick = tick
    this.targetFrameMs = 1000 / Math.max(1, maxFps)
  }

  start(): void {
    if (this.rafId !== null) return
    this.lastTime = performance.now()
    this.lastFrameTime = this.lastTime
    this.frameAccumulatorMs = 0
    const frame = (now: number) => {
      this.rafId = requestAnimationFrame(frame)
      if (document.hidden) {
        this.lastTime = now
        this.lastFrameTime = now
        this.frameAccumulatorMs = 0
        return
      }
      this.frameAccumulatorMs += Math.min(100, now - this.lastFrameTime)
      this.lastFrameTime = now
      // requestAnimationFrame follows the monitor refresh rate. Without a
      // guard, 120/144/240 Hz displays render the complete WebGL scene that
      // many times even though the game only needs a stable 60 fps.
      if (this.frameAccumulatorMs + 0.75 < this.targetFrameMs) return
      this.frameAccumulatorMs = Math.max(0, this.frameAccumulatorMs - this.targetFrameMs)
      const rawDt = (now - this.lastTime) / 1000
      this.lastTime = now
      const dt = rawDt > this.maxDt ? this.maxDt : rawDt
      try {
        this.tick(dt, now)
      } catch (e) {
        console.warn('[F1S] tick error:', e)
      }
    }
    this.rafId = requestAnimationFrame(frame)
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}

/**
 * RAF loop with configurable frame rate throttling.
 * Compensates for drift by tracking elapsed time since last frame.
 *
 * The throttling logic is exposed via `tick(now)` for testability;
 * the RAF loop calls it automatically.
 */
export class RafLoop {
  private rafId = 0
  private lastFrameTime = -1
  private frameInterval: number
  private callback: (timestamp: number) => void
  private stopped = false

  constructor(fps: number, callback: (timestamp: number) => void, autoStart = true) {
    this.frameInterval = 1000 / fps
    this.callback = callback
    if (autoStart) this.start()
  }

  start(): void {
    if (this.rafId !== 0 || this.stopped) return
    this.rafId = requestAnimationFrame(this.#rafCallback)
  }

  #rafCallback = (now: number): void => {
    if (this.stopped) return
    this.tick(now)
    this.rafId = requestAnimationFrame(this.#rafCallback)
  }

  /**
   * Throttled tick — calls the user callback only if enough time has elapsed.
   * Exposed for testing. Returns true if the callback was invoked.
   */
  tick(now: number): boolean {
    if (this.stopped) return false
    // First frame always fires
    if (this.lastFrameTime < 0) {
      this.lastFrameTime = now
      this.callback(now)
      return true
    }
    const elapsed = now - this.lastFrameTime
    if (elapsed >= this.frameInterval) {
      this.lastFrameTime = now - (elapsed % this.frameInterval)
      this.callback(now)
      return true
    }
    return false
  }

  setFps(fps: number): void {
    this.frameInterval = 1000 / fps
  }

  stop(): void {
    this.stopped = true
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }
}

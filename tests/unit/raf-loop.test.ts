import { describe, it, expect, vi } from 'vitest'
import { RafLoop } from '../../src/core/raf-loop'

describe('RafLoop', () => {
  it('fires on first tick (lastFrameTime = -1)', () => {
    const cb = vi.fn()
    const loop = new RafLoop(60, cb, false)

    expect(loop.tick(0)).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(loop.tick(10)).toBe(false) // 10ms < 16.67ms
    expect(loop.tick(17)).toBe(true)  // 17ms >= 16.67ms
  })

  it('throttles frames to the configured fps', () => {
    const cb = vi.fn()
    const loop = new RafLoop(60, cb, false)

    expect(loop.tick(0)).toBe(true)     // first frame
    expect(loop.tick(10)).toBe(false)   // too soon
    expect(loop.tick(16)).toBe(false)   // still too soon
    expect(loop.tick(17)).toBe(true)    // fires
    expect(loop.tick(33)).toBe(false)   // only 16ms since last
    expect(loop.tick(34)).toBe(true)    // 17ms since last → fires
  })

  it('setFps changes the throttle interval', () => {
    const cb = vi.fn()
    const loop = new RafLoop(60, cb, false)

    expect(loop.tick(0)).toBe(true)   // first
    expect(loop.tick(17)).toBe(true)  // 60fps → fires at 17ms

    loop.setFps(30) // 33.33ms interval
    expect(loop.tick(34)).toBe(false) // only 17ms since last (34-17=17 < 33)
    expect(loop.tick(51)).toBe(true)  // 34ms since last (51-17=34 >= 33) → fires
  })

  it('stop prevents tick from firing', () => {
    const cb = vi.fn()
    const loop = new RafLoop(60, cb, false)

    expect(loop.tick(0)).toBe(true)
    expect(loop.tick(17)).toBe(true)

    loop.stop()
    expect(loop.tick(100)).toBe(false) // stopped
  })
})

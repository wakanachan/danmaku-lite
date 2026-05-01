import { describe, it, expect } from 'vitest'
import { TrackManager } from '../../src/engine/canvas/track-manager'

describe('TrackManager', () => {
  it('resize calculates track count from area and height', () => {
    const tm = new TrackManager()
    tm.resize(720, 0.75, 30)
    // 720 * 0.75 / 30 = 18 tracks
    // Verifying by allocating scroll tracks exhaustively
    const results: number[] = []
    for (let i = 0; i < 18; i++) {
      const r = tm.acquireScroll(0, 100, 100, 1280)
      expect(r).not.toBeNull()
      results.push(r!.track)
    }
    // All 18 tracks allocated
    expect(new Set(results).size).toBe(18)
    // No more available
    expect(tm.acquireScroll(0, 100, 100, 1280)).toBeNull()
  })

  it('track y positions are distinct', () => {
    const tm = new TrackManager()
    tm.resize(720, 0.75, 30)
    const r0 = tm.acquireScroll(0, 100, 100, 1280)
    const r1 = tm.acquireScroll(0, 100, 100, 1280)
    // Both tracks allocated successfully at different y positions
    expect(r0!.y).not.toBe(r1!.y)
  })

  it('releases and reuses scroll tracks', () => {
    const tm = new TrackManager()
    tm.resize(720, 0.75, 30)

    const r = tm.acquireScroll(0, 100, 100, 1280)
    expect(r).not.toBeNull()

    tm.releaseScroll(r!.track)
    const r2 = tm.acquireScroll(100, 100, 100, 1280)
    expect(r2!.track).toBe(r!.track)
  })

  it('acquireTop allocates top tracks', () => {
    const tm = new TrackManager()
    tm.resize(720, 0.75, 30)
    const r = tm.acquireTop(0, 4)
    expect(r).not.toBeNull()
    // Top tracks are in the upper portion of the container
    expect(r!.y).toBeGreaterThanOrEqual(0)
    expect(r!.y).toBeLessThan(720 * 0.75) // within the area
  })

  it('acquireBottom allocates bottom tracks', () => {
    const tm = new TrackManager()
    tm.resize(720, 0.75, 30)
    const r = tm.acquireBottom(0, 4)
    expect(r).not.toBeNull()
    // Bottom tracks are in the lower portion
    expect(r!.y).toBeGreaterThan(720 * 0.25)
    expect(r!.y).toBeLessThanOrEqual(720)
  })

  it('track exit time prevents immediate reuse', () => {
    const tm = new TrackManager()
    tm.resize(720, 0.75, 30)

    // Allocate all tracks at t=0
    const tracks: number[] = []
    for (let i = 0; i < 18; i++) {
      const r = tm.acquireScroll(0, 100, 100, 1280)
      tracks.push(r!.track)
    }

    // At t=0.1, not enough time for any track to free up
    expect(tm.acquireScroll(0.1, 100, 100, 1280)).toBeNull()
  })
})

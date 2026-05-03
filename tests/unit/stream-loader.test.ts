import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StreamLoader } from '../../src/core/stream-loader'
import { Scheduler } from '../../src/core/scheduler'
import type { DataSourceAdapter, DanmakuItem } from '../../src'
import { DanmakuMode } from '../../src'

function makeItem(id: number, time: number, text = 'test'): DanmakuItem {
  return { id, text, time, mode: DanmakuMode.Scroll, color: 0xffffff }
}

function createMockAdapter(results: DanmakuItem[][]): DataSourceAdapter {
  let callIndex = 0
  return {
    fetch: vi.fn().mockImplementation(() => {
      const items = results[callIndex] ?? []
      callIndex++
      return Promise.resolve(items)
    }),
  }
}

/** Non-destructive: check pool content without advancing cursor */
function hasPoolItems(s: Scheduler, count: number): boolean {
  const { pool, cursor } = s.preCacheInfo()
  return pool.length - cursor >= count
}

describe('StreamLoader', () => {
  let scheduler: Scheduler

  beforeEach(() => {
    scheduler = new Scheduler()
  })

  it('fetches when gap exists on first probe', async () => {
    const adapter = createMockAdapter([[makeItem(1, 0), makeItem(2, 5)]])
    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    sl.probe(0, scheduler)

    // Wait for promise to resolve (non-destructive check via preCacheInfo)
    await vi.waitFor(() => expect(hasPoolItems(scheduler, 2)).toBe(true), { timeout: 1000 })
    const batch = scheduler.emitBatch(6000)
    expect(batch.map(i => i.time)).toEqual([0, 5])
  })

  it('does not fetch when range is already covered', async () => {
    const adapter = createMockAdapter([[makeItem(1, 0)]])
    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    sl.probe(0, scheduler)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })

    // Second probe at same position — should not trigger fetch
    sl.probe(0, scheduler)
    // No new fetch call occurred
    expect(adapter.fetch).toHaveBeenCalledTimes(1)
  })

  it('fetches new segment when position advances beyond covered range', async () => {
    const adapter = createMockAdapter([
      [makeItem(1, 0), makeItem(2, 5)],
      [makeItem(3, 65), makeItem(4, 70)],
    ])
    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    // First fetch covers [0, 60)
    sl.probe(0, scheduler)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })

    // Position advanced to 50, need [50, 110) — gap at [60, 110)
    sl.probe(50, scheduler)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(2), { timeout: 1000 })

    // Should have all items
    const batch = scheduler.emitBatch(75000)
    expect(batch.map(i => i.time)).toEqual([0, 5, 65, 70])
  })

  it('evicts old data when leadTime > 0', async () => {
    const adapter = createMockAdapter([
      [makeItem(1, 0), makeItem(2, 10), makeItem(3, 20), makeItem(4, 30)],
    ])
    const sl = new StreamLoader(adapter, 60, 15, 0.2)

    sl.probe(0, scheduler)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })

    // Position advanced past leadTime — items before 25s (position 40 - 15) evicted
    sl.probe(40, scheduler)
    const batch = scheduler.emitBatch(50000)
    expect(batch.map(i => i.time)).toEqual([30])
  })

  it('reset cancels pending and clears ranges', async () => {
    const adapter = createMockAdapter([
      [makeItem(1, 0)],
      [makeItem(2, 100)],
    ])
    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    sl.probe(0, scheduler)
    // Reset before first fetch resolves
    sl.reset()

    // Wait for pending to resolve (should be discarded)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })

    // Should have no items (first fetch discarded, range cache cleared)
    const batch = scheduler.emitBatch(6000)
    expect(batch).toHaveLength(0)
  })

  it('stale fetch results are discarded (race avoidance)', async () => {
    let resolveFirst!: (items: DanmakuItem[]) => void
    let resolveSecond!: (items: DanmakuItem[]) => void

    const firstPromise = new Promise<DanmakuItem[]>(r => { resolveFirst = r })
    const secondPromise = new Promise<DanmakuItem[]>(r => { resolveSecond = r })

    const adapter: DataSourceAdapter = {
      fetch: vi.fn()
        .mockReturnValueOnce(firstPromise)
        .mockReturnValueOnce(secondPromise),
    }

    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    // First fetch starts
    sl.probe(0, scheduler)
    expect(adapter.fetch).toHaveBeenCalledTimes(1)

    // Seek triggers reset, new fetch starts
    sl.reset()
    sl.probe(100, scheduler)
    expect(adapter.fetch).toHaveBeenCalledTimes(2)

    // First (stale) fetch resolves
    resolveFirst([makeItem(1, 0)])
    // Flush microtasks so stale result's .then runs
    await Promise.resolve()

    // Second fetch resolves
    resolveSecond([makeItem(2, 100)])
    // Wait for the real items to be added to scheduler pool
    await vi.waitFor(() => expect(hasPoolItems(scheduler, 1)).toBe(true), { timeout: 1000 })

    // Should only have item from second fetch
    const batch = scheduler.emitBatch(101000)
    expect(batch).toHaveLength(1)
    expect(batch[0]!.time).toBe(100)
  })

  it('empty result from fetch marks range as covered', async () => {
    const adapter = createMockAdapter([[]]) // empty
    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    sl.probe(0, scheduler)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })

    // Second probe should not re-fetch (range covered even though empty)
    sl.probe(0, scheduler)
    expect(adapter.fetch).toHaveBeenCalledTimes(1)
  })

  it('error in fetch does not mark range as covered', async () => {
    const adapter: DataSourceAdapter = {
      fetch: vi.fn().mockRejectedValue(new Error('Network error')),
    }
    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    sl.probe(0, scheduler)
    // Wait for the first fetch to be called and its rejection handler to run
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })
    // Flush microtasks so .catch runs and clears #pending
    await Promise.resolve()

    // Next tick should re-attempt fetch (range not covered, pending cleared)
    sl.probe(0, scheduler)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(2), { timeout: 1000 })
  })

  it('skips fetch when one is already in-flight', async () => {
    let resolveFirst!: (items: DanmakuItem[]) => void
    const firstPromise = new Promise<DanmakuItem[]>(r => { resolveFirst = r })

    const adapter: DataSourceAdapter = {
      fetch: vi.fn().mockReturnValue(firstPromise),
    }
    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    sl.probe(0, scheduler)
    sl.probe(0, scheduler) // second call while first is in-flight
    expect(adapter.fetch).toHaveBeenCalledTimes(1) // only one fetch

    resolveFirst([makeItem(1, 0)])
    await vi.waitFor(() => expect(hasPoolItems(scheduler, 1)).toBe(true), { timeout: 1000 })
  })

  it('seek detection resets when position jumps >500ms', async () => {
    const adapter = createMockAdapter([
      [makeItem(1, 0)],
      [makeItem(2, 100)],
    ])
    const sl = new StreamLoader(adapter, 60, 0, 0.2)

    sl.probe(0, scheduler)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })

    // Jump position by >500ms — triggers internal reset
    sl.probe(10, scheduler)
    await vi.waitFor(() => expect(adapter.fetch).toHaveBeenCalledTimes(2), { timeout: 1000 })
  })
})

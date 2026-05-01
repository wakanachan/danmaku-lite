import { describe, it, expect, vi } from 'vitest'
import { Scheduler } from '../../src/core/scheduler'
import type { DanmakuItem } from '../../src'
import { DanmakuMode } from '../../src'
import type { VisibleDanmaku } from '../../src/types/internal'

function makeItem(time: number, text = 'test'): DanmakuItem {
  return { id: time, text, time, mode: DanmakuMode.Scroll, color: 0xffffff }
}

function makeVisible(overrides: Partial<VisibleDanmaku> = {}): VisibleDanmaku {
  return {
    id: 1,
    text: 'hello',
    mode: DanmakuMode.Scroll,
    color: 0xffffff,
    fontSize: 25,
    x: 500,
    y: 50,
    track: 0,
    w: 100,
    h: 25,
    born: 0,
    duration: 0,
    ...overrides,
  }
}

describe('Scheduler', () => {
  describe('load', () => {
    it('sorts items by time', () => {
      const s = new Scheduler()
      s.load([
        makeItem(10),
        makeItem(2),
        makeItem(5),
      ])
      const batch = s.emitBatch(11000)
      expect(batch.map((i) => i.time)).toEqual([2, 5, 10])
    })
  })

  describe('emitBatch', () => {
    it('returns items up to and including the time position', () => {
      const s = new Scheduler()
      s.load([makeItem(1), makeItem(3), makeItem(5)])
      const batch = s.emitBatch(3000) // position=3s → 3000ms
      expect(batch.map((i) => i.time)).toEqual([1, 3])
    })

    it('returns empty when no items to emit', () => {
      const s = new Scheduler()
      s.load([makeItem(5)])
      expect(s.emitBatch(1000)).toEqual([])
    })

    it('returns empty when all items already emitted', () => {
      const s = new Scheduler()
      s.load([makeItem(1)])
      s.emitBatch(2000)
      expect(s.emitBatch(5000)).toEqual([])
    })

    it('returns empty for empty pool', () => {
      const s = new Scheduler()
      expect(s.emitBatch(5000)).toEqual([])
    })
  })

  describe('compact', () => {
    it('removes scrolling danmaku that have scrolled off-screen', () => {
      const s = new Scheduler()
      const visible = [makeVisible({ x: -200, w: 100 })] // fully off screen
      const onRemove = vi.fn()
      const len = s.compact(visible, 10, 0.1, 100, onRemove)
      expect(len).toBe(0)
      expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it('removes fixed danmaku whose duration has expired', () => {
      const s = new Scheduler()
      const visible = [makeVisible({ mode: DanmakuMode.Top, born: 0, duration: 4 })]
      const onRemove = vi.fn()
      const len = s.compact(visible, 5, 0.1, 100, onRemove) // now=5s > born+4s
      expect(len).toBe(0)
      expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it('keeps active scrolling danmaku', () => {
      const s = new Scheduler()
      const visible = [makeVisible({ x: 500, w: 100 })]
      const onRemove = vi.fn()
      const len = s.compact(visible, 1, 0.1, 100, onRemove)
      expect(len).toBe(1)
      expect(onRemove).not.toHaveBeenCalled()
    })

    it('updates x position for scrolling danmaku', () => {
      const s = new Scheduler()
      const visible = [makeVisible({ x: 500, w: 100 })]
      const onRemove = vi.fn()
      s.compact(visible, 1, 0.1, 100, onRemove)
      // scrollSpeed * dt = 100 * 0.1 = 10px left
      expect(visible[0]!.x).toBe(490)
    })

    it('compacts in-place (fills gaps from removed items)', () => {
      const s = new Scheduler()
      const visible = [
        makeVisible({ x: -200, w: 100, id: 1 }), // stale
        makeVisible({ x: 500, w: 100, id: 2 }),  // active
        makeVisible({ x: -200, w: 100, id: 3 }), // stale
      ]
      const onRemove = vi.fn()
      const len = s.compact(visible, 1, 0.1, 100, onRemove)
      expect(len).toBe(1)
      expect(visible[0]!.id).toBe(2)
    })
  })
})

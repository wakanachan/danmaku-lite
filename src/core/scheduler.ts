import type { DanmakuItem } from '../types'
import type { VisibleDanmaku } from '../types/internal'
import { binarySearch } from '../utils/math'

/**
 * Handles emission (time-based insertion of new danmaku) and stale cleanup
 * (removal of danmaku that have scrolled off-screen or expired).
 */
export class Scheduler {
  /** Sorted danmaku pool */
  private pool: DanmakuItem[] = []
  /** Index into pool — items before this have been emitted */
  private cursor = 0

  load(items: readonly DanmakuItem[]): void {
    this.pool = [...items].sort((a, b) => a.time - b.time)
    this.cursor = 0
  }

  clear(): void {
    this.pool = []
    this.cursor = 0
  }

  /**
   * Find all danmaku that should be emitted at or before `timeMs` (in milliseconds).
   * Returns an array of un-emitted items. Caller is responsible for actually
   * creating VisibleDanmaku instances.
   *
   * Handles backward seeks by rewinding the cursor when the playback position
   * jumps before previously-emitted items.
   */
  emitBatch(timeMs: number): DanmakuItem[] {
    if (this.pool.length === 0) return []

    // Detect backward seek: cursor is past the current playback position
    const cursorTime = this.cursor < this.pool.length
      ? (this.pool[this.cursor]?.time ?? 0) * 1000
      : Infinity
    if (timeMs < cursorTime - 200) {
      // Seeked backward — rewind cursor to match new position
      this.cursor = binarySearch(this.pool, timeMs, (item) => (item.time ?? 0) * 1000)
    }

    if (this.cursor >= this.pool.length) return []
    const cutoff = binarySearch(this.pool, timeMs, (item) => (item.time ?? 0) * 1000)
    if (cutoff <= this.cursor) return []
    const batch = this.pool.slice(this.cursor, cutoff)
    this.cursor = cutoff
    return batch
  }

  /**
   * Remove stale visible danmaku in-place and return the new length.
   * For mode 1 (scroll): removed when x + w < -10 (fully off-screen left).
   * For mode 5/6 (fixed): removed when duration expired.
   *
   * @returns Callback for each removed item to recycle tracks/elements.
   */
  compact(
    visible: VisibleDanmaku[],
    now: number,
    dt: number,
    scrollSpeed: number,
    onRemove: (v: VisibleDanmaku) => void,
  ): number {
    let vi = 0
    for (let i = 0; i < visible.length; i++) {
      const v = visible[i]!

      if (v.mode === 1) {
        v.x -= scrollSpeed * dt
        if (v.x + v.w < -10) {
          onRemove(v)
          continue
        }
      } else {
        if (now - v.born >= v.duration) {
          onRemove(v)
          continue
        }
      }

      // Compact: overwrite stale entries in-place
      if (vi !== i) visible[vi] = visible[i]!
      vi++
    }
    return vi
  }

  /** Get info needed for pre-caching: the pool and current cursor. */
  preCacheInfo(): { pool: readonly DanmakuItem[]; cursor: number } {
    return { pool: this.pool, cursor: this.cursor }
  }

  /**
   * Merge new items into the sorted pool using a merge-join.
   * Items with duplicate IDs (already in pool) are skipped.
   * Used by StreamLoader for incremental streaming loads.
   */
  add(items: readonly DanmakuItem[]): void {
    if (items.length === 0) return

    const existingIds = new Set<number | string>()
    for (let i = 0; i < this.pool.length; i++) {
      existingIds.add(this.pool[i]!.id)
    }

    const newItems = [...items]
      .filter(item => !existingIds.has(item.id))
      .sort((a, b) => a.time - b.time)

    if (newItems.length === 0) return

    // Merge-join: pool and newItems are both sorted by time
    const merged: DanmakuItem[] = []
    let pi = 0, ni = 0
    while (pi < this.pool.length && ni < newItems.length) {
      if (this.pool[pi]!.time <= newItems[ni]!.time) {
        merged.push(this.pool[pi]!)
        pi++
      } else {
        merged.push(newItems[ni]!)
        ni++
      }
    }
    while (pi < this.pool.length) merged.push(this.pool[pi++]!)
    while (ni < newItems.length) merged.push(newItems[ni++]!)

    this.pool = merged
  }

  /**
   * Evict pool items whose time is before `timeSec` (in seconds).
   * Adjusts cursor so it remains valid after eviction.
   */
  evictBefore(timeSec: number): void {
    if (this.pool.length === 0) return

    // Use a tiny epsilon so items with time === timeSec are NOT evicted.
    // binarySearch returns first index where value > target, so
    // target = timeSec*1000 - 0.1 means we keep items at exactly timeSec.
    const cutoff = binarySearch(
      this.pool,
      timeSec * 1000 - 0.1,
      (item) => (item.time ?? 0) * 1000,
    )

    if (cutoff === 0) return

    this.pool.splice(0, cutoff)
    this.cursor = Math.max(0, this.cursor - cutoff)
  }
}

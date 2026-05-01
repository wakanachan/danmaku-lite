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
}

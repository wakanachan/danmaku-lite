import type { DataSourceAdapter } from '../types'
import type { Scheduler } from './scheduler'

interface CoveredRange {
  start: number
  end: number
}

/**
 * Manages time-range-based fetch coordination for streaming danmaku.
 *
 * Maintains a sorted, merged list of covered time ranges to avoid
 * re-fetching data the engine already has. Fetches are triggered when
 * the current playback position approaches uncovered ranges.
 *
 * Handles:
 * - Local player: fetch(0, duration) once, full data upfront
 * - Online VOD: fetch segments as position advances
 * - Live streaming: continuous fetch, leadTime eviction to bound memory
 */
export class StreamLoader {
  readonly #adapter: DataSourceAdapter
  readonly #preBuffer: number
  readonly #leadTime: number
  readonly #seekThreshold: number
  readonly #onError?: (error: Error) => void

  /** Sorted, non-overlapping time ranges already fetched */
  #ranges: CoveredRange[] = []

  /** Monotonically increasing request ID for stale-result rejection */
  #requestId = 0

  /** Currently in-flight fetch (or null) */
  #pending: Promise<void> | null = null

  /** Position at last probe, used for seek detection */
  #lastPosition = -1

  constructor(
    adapter: DataSourceAdapter,
    preBuffer: number,
    leadTime: number,
    seekThreshold: number,
    onError?: (error: Error) => void,
  ) {
    this.#adapter = adapter
    this.#preBuffer = Math.max(1, preBuffer)
    this.#leadTime = Math.max(0, leadTime)
    this.#seekThreshold = Math.max(0.5, seekThreshold * 2.5)
    this.#onError = onError
  }

  /**
   * Called every tick. Checks coverage, processes completed fetches,
   * triggers new fetches, and evicts old data.
   *
   * @param position  - Current playback position in seconds
   * @param scheduler - The engine's scheduler instance
   */
  probe(position: number, scheduler: Scheduler): void {
    // --- Seek detection ---
    if (this.#lastPosition >= 0 && Math.abs(position - this.#lastPosition) > this.#seekThreshold) {
      this.reset()
    }
    this.#lastPosition = position

    // --- Eviction ---
    if (this.#leadTime > 0) {
      const evictThreshold = position - this.#leadTime
      scheduler.evictBefore(evictThreshold)
      // Trim covered ranges behind eviction threshold
      this.#ranges = this.#ranges.filter(r => r.end > evictThreshold)
    }

    // --- Coverage check ---
    if (this.#pending) return // Already fetching

    const targetEnd = position + this.#preBuffer
    const gap = this.#findGap(position, targetEnd)
    if (gap) {
      this.#doFetch(gap.start, gap.end, scheduler)
    }
  }

  /**
   * Cancel any in-flight fetch and clear the range cache.
   * Call when the user seeks or loads new data externally.
   */
  reset(): void {
    this.#requestId++
    this.#pending = null
    this.#ranges = []
    this.#lastPosition = -1
  }

  destroy(): void {
    this.reset()
  }

  // ================================================================
  // Private
  // ================================================================

  /**
   * Find the first uncovered gap in [position, targetEnd].
   * Returns null if the range is fully covered.
   */
  #findGap(position: number, targetEnd: number): CoveredRange | null {
    let cursor = position
    for (const r of this.#ranges) {
      if (r.start <= cursor && cursor < r.end) {
        cursor = r.end
        if (cursor >= targetEnd) return null
      } else if (r.start > cursor) {
        return { start: cursor, end: Math.min(r.start, targetEnd) }
      }
    }
    if (cursor < targetEnd) {
      return { start: cursor, end: targetEnd }
    }
    return null
  }

  #doFetch(start: number, end: number, scheduler: Scheduler): void {
    const id = ++this.#requestId
    this.#pending = this.#adapter
      .fetch(start, end)
      .then(items => {
        if (id !== this.#requestId) return // Superseded by later request
        this.#pending = null

        if (items.length > 0) {
          scheduler.add(items)
        }

        // Mark range as covered (even if empty, to prevent re-fetch loop)
        this.#mergeRange({ start, end })
      })
      .catch((err) => {
        if (id !== this.#requestId) return // Superseded
        this.#pending = null
        // Do NOT mark range as covered on error — retry next tick
        this.#onError?.(err instanceof Error ? err : new Error(String(err)))
      })
  }

  /** Insert a covered range, merging with adjacent/overlapping ranges. */
  #mergeRange(range: CoveredRange): void {
    this.#ranges.push(range)
    this.#ranges.sort((a, b) => a.start - b.start)

    const merged: CoveredRange[] = []
    for (const r of this.#ranges) {
      const last = merged[merged.length - 1]
      if (last && last.end >= r.start) {
        last.end = Math.max(last.end, r.end)
      } else {
        merged.push({ ...r })
      }
    }
    this.#ranges = merged
  }
}

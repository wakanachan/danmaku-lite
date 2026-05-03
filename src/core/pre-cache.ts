import '../polyfills/requestIdleCallback'
import type { DanmakuItem } from '../types'

/**
 * Pre-cache callback. Called during idle time to warm up measurements or bitmaps.
 */
export type PreCacheFn = (item: DanmakuItem) => void

/**
 * Schedules pre-caching of upcoming danmaku during browser idle time.
 * Uses requestIdleCallback with a timeout fallback.
 */
export function schedulePreCache(
  items: readonly DanmakuItem[],
  startIdx: number,
  count: number,
  fn: PreCacheFn,
): () => void {
  let idleHandle = 0
  let idx = startIdx

  function process(deadline: IdleDeadline) {
    const end = Math.min(startIdx + count, items.length)
    let processed = 0
    while (idx < end && (deadline.timeRemaining() > 1 || processed < 5)) {
      const item = items[idx]
      if (item) fn(item)
      idx++
      processed++
    }
    if (idx < end) {
      idleHandle = requestIdleCallback(process, { timeout: 2000 })
    }
  }

  idleHandle = requestIdleCallback(process, { timeout: 2000 })

  return () => cancelIdleCallback(idleHandle)
}

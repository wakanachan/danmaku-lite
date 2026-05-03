import type { DanmakuItem } from './danmaku-item'

/**
 * Adapter for streaming danmaku data from a remote source.
 * The host application provides a fetch implementation that
 * calls their backend API or reads from local storage.
 */
export interface DataSourceAdapter {
  /**
   * Fetch danmaku items for a given time range.
   *
   * @param start - Start time in seconds (inclusive)
   * @param end   - End time in seconds (exclusive). May be Infinity
   *                for live streaming where the end is unknown.
   * @returns Promise resolving to the danmaku items in this range.
   *          Items do NOT need to be sorted — the engine sorts them.
   *          May be empty if no items exist in this range.
   */
  fetch(start: number, end: number): Promise<DanmakuItem[]>
}

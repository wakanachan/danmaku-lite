/** Danmaku display mode constants (matches Bilibili convention). */
export const enum DanmakuMode {
  /** Right-to-left scrolling (standard) */
  Scroll = 1,
  /** Top-center fixed */
  Top = 5,
  /** Bottom-center fixed */
  Bottom = 6,
}

export interface DanmakuItem {
  /** Unique identifier. Used for deduplication on load(). */
  id: number | string
  /** Display text. Plain string — no HTML. */
  text: string
  /** Emission time in seconds (media time, not wall time). */
  time: number
  /** Display mode. @see DanmakuMode */
  mode: DanmakuMode
  /** 24-bit RGB color (e.g. 0xFFFFFF). */
  color: number
  /** Font size in CSS pixels for this item. Overrides engine default if set. */
  font_size?: number
}

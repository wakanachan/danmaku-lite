import type { DanmakuItem } from './danmaku-item'
import type { OverflowStrategy } from './config'

/** Contract fulfilled by both CanvasEngine and DOMEngine. */
export interface DanmakuEngine {
  // ---- Lifecycle ----

  /** Load (replace) the entire danmaku list. Sorted by time internally. */
  load(items: readonly DanmakuItem[]): void

  /** Remove all loaded danmaku and clear visible elements. */
  clear(): void

  /** Recalculate dimensions after container resize. Consumer must call this. */
  resize(): void

  /** Permanently destroy the engine. Frees all resources. Idempotent. */
  destroy(): void

  /** Whether destroy() has been called. */
  readonly isDestroyed: boolean

  // ---- Runtime setters (each triggers necessary side effects) ----

  setEnabled(v: boolean): void
  setFps(v: number): void
  setArea(v: number): void
  setOpacity(v: number): void
  setSpeed(v: number): void
  setFontFamily(v: string): void
  setFontSize(v: number): void
  setFontWeight(v: string): void
  setStrokeWidth(v: number): void
  setStrokeColor(v: number): void
  setPadding(v: number): void
  setDuration(v: number): void
  setOverflow(v: OverflowStrategy): void
  setMaxVisible(v: number): void
  setMaxCache(v: number): void
  setPreCacheCount(v: number): void
  setSmoothing(v: boolean): void
  setWillChange(v: boolean): void
  setUseTextShadow(v: boolean): void
}

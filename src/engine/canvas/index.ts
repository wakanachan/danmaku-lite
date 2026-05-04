import type { DanmakuItem, DanmakuOptions } from '../../types'
import type { VisibleDanmaku } from '../../types/internal'
import { DanmakuEngineBase } from '../base'
import { CanvasRenderer } from './renderer'
import { ObjectPool } from './pool'
import { BitmapCache } from './bitmap-cache'
import { schedulePreCache } from '../../core/pre-cache'

export class CanvasEngine extends DanmakuEngineBase {
  #renderer: CanvasRenderer
  #pool = new ObjectPool()
  #cache: BitmapCache
  #cancelPreCache: (() => void) | null = null

  constructor(options: DanmakuOptions) {
    super(options)
    this.#renderer = new CanvasRenderer(options.container)
    this.#renderer.setSmoothing(this.cfg.smoothing)
    this.#cache = new BitmapCache(this.cfg.maxCache)
    this.initTracks()
  }

  // ==================================================================
  // Abstract hook implementations
  // ==================================================================

  protected get rendererWidth(): number {
    return this.#renderer.width
  }
  protected get rendererHeight(): number {
    return this.#renderer.height
  }
  protected clearRenderer(): void {
    this.#renderer.clear()
  }
  protected destroyRenderer(): void {
    this.#renderer.destroy()
  }
  protected updateDimensions(): boolean {
    const ok = this.#renderer.updateDimensions()
    if (ok) {
      this.#cache.setDpr(this.#renderer.devicePixelRatio)
      this.#cache.invalidateTextCache()
    }
    return ok
  }
  protected measureTextWidth(text: string, family: string, size: number, weight: string): number {
    return this.#cache.measure(text, family, size, weight, this.#renderer.ctx)
  }
  protected renderDanmaku(v: VisibleDanmaku): void {
    const cfg = this.cfg
    v.bmp = this.#cache.getBitmap(
      v.text, v.fontSize, v.color, cfg.strokeWidth, cfg.strokeColor,
      cfg.fontFamily, cfg.fontWeight,
      this.#renderer.devicePixelRatio, cfg.padding,
    )
  }
  protected releaseVisibleResource(v: VisibleDanmaku): void {
    this.#pool.release(v)
  }
  protected releaseAllVisibleResources(): void {
    this.#pool.releaseAll(this.visible)
    this.#cache.clearAll()
    this.#renderer.clear()
  }
  protected refreshVisibleDanmaku(): void {
    const ctx = this.#renderer.ctx
    const cfg = this.cfg
    const dpr = this.#renderer.devicePixelRatio
    const visible = this.visible
    for (let i = 0; i < visible.length; i++) {
      const v = visible[i]!
      const fs = v.fontSize
      const tw = this.#cache.measure(v.text, cfg.fontFamily, fs, cfg.fontWeight, ctx)
      v.w = tw + cfg.padding * 2
      v.h = fs
      v.bmp = this.#cache.getBitmap(
        v.text, fs, v.color, cfg.strokeWidth, cfg.strokeColor,
        cfg.fontFamily, cfg.fontWeight, dpr, cfg.padding,
      )
    }
  }
  protected drawFrame(W: number, _H: number): void {
    this.#renderer.clear()
    this.#renderer.setGlobalAlpha(this.cfg.opacity)

    const dpr = this.#renderer.devicePixelRatio
    const pad = this.cfg.padding
    const visible = this.visible

    for (let i = 0; i < visible.length; i++) {
      const v = visible[i]!
      const bmp = v.bmp
      if (!bmp) continue

      if (!this.#cache.isAlive(bmp)) { v.bmp = undefined; continue }

      const dx = v.x | 0
      const dy = v.y | 0
      const sw = bmp.width
      const sh = bmp.height
      const dw = sw / dpr
      const dh = sh / dpr

      const ctx = this.#renderer.ctx
      if (v.mode === 1 /* Scroll */) {
        ctx.drawImage(bmp, 0, 0, sw, sh, dx - pad, (dy - dh / 2) | 0, dw, dh)
      } else {
        ctx.drawImage(bmp, 0, 0, sw, sh, (dx - dw / 2) | 0, (dy - dh / 2) | 0, dw, dh)
      }
    }
  }
  protected override acquireVisibleDanmaku(): VisibleDanmaku {
    return this.#pool.acquire()
  }
  protected override onAfterLoad(): void {
    this.#cancelPreCache?.()
    this.#cancelPreCache = null
    this.#schedulePreCache()
  }
  protected override onAfterTick(): void {
    this.#schedulePreCache()
  }

  // ==================================================================
  // Override setters — add canvas-specific cache invalidation + refresh
  // ==================================================================

  setEnabled(v: boolean): void {
    super.setEnabled(v)
    if (!v) this.#renderer.clear()
  }

  setFontFamily(v: string): void {
    super.setFontFamily(v)
    this.#cache.invalidateTextCache()
    this.#cache.clearBitmaps()
    this.refreshVisibleDanmaku()
  }

  setFontSize(v: number): void {
    super.setFontSize(v)
    this.#cache.invalidateTextCache()
    this.#cache.clearBitmaps()
    this.refreshVisibleDanmaku()
  }

  setFontWeight(v: string): void {
    super.setFontWeight(v)
    this.#cache.invalidateTextCache()
    this.#cache.clearBitmaps()
    this.refreshVisibleDanmaku()
  }

  setStrokeWidth(v: number): void {
    super.setStrokeWidth(v)
    this.#cache.clearBitmaps()
    this.refreshVisibleDanmaku()
  }

  setStrokeColor(v: number): void {
    super.setStrokeColor(v)
    this.#cache.clearBitmaps()
    this.refreshVisibleDanmaku()
  }

  setPadding(v: number): void {
    super.setPadding(v)
    this.#cache.clearBitmaps()
    this.refreshVisibleDanmaku()
  }

  setScrollGap(v: number) {
    super.setScrollGap(v);
    this.refreshVisibleDanmaku()
  }

  setMaxCache(v: number): void {
    if (this.isDestroyed) return
    this.cfg.maxCache = Math.max(10, v)
    this.#cache.setMaxCache(this.cfg.maxCache)
  }

  setPreCacheCount(v: number): void {
    if (this.isDestroyed) return
    this.cfg.preCacheCount = Math.max(0, v)
  }

  setSmoothing(v: boolean): void {
    if (this.isDestroyed) return
    this.cfg.smoothing = v
    this.#renderer.setSmoothing(v)
  }

  // ==================================================================
  // Internal: pre-cache scheduling
  // ==================================================================

  #schedulePreCache(): void {
    if (this.#cancelPreCache || this.isDestroyed) return
    const { pool, cursor } = this.getPreCacheInfo()
    const cfg = this.cfg

    this.#cancelPreCache = schedulePreCache(
      pool, cursor, cfg.preCacheCount,
      (item: DanmakuItem) => {
        const text = item.text ?? ''
        const fs = item.font_size ?? cfg.fontSize
        const color = item.color ?? 0xffffff
        this.#cache.measure(text, cfg.fontFamily, fs, cfg.fontWeight, this.#renderer.ctx)
        try {
          this.#cache.getBitmap(
            text, fs, color, cfg.strokeWidth, cfg.strokeColor,
            cfg.fontFamily, cfg.fontWeight,
            this.#renderer.devicePixelRatio, cfg.padding,
          )
        } catch { /* bitmap creation may fail for empty text */ }
      },
    )
  }
}
import type { DanmakuEngine, DanmakuItem, DanmakuOptions, OverflowStrategy } from '../types'
import type { VisibleDanmaku, ResolvedConfig } from '../types/internal'
import { DanmakuMode } from '../types'
import { TrackManager } from '../core/track-manager'
import { RafLoop } from '../core/raf-loop'
import { Scheduler } from '../core/scheduler'
import { SHARED_DEFAULTS } from '../core/defaults'
import { StreamLoader } from '../core/stream-loader'
import { clamp } from '../utils/math'

/**
 * Abstract base for CanvasEngine and DOMEngine.
 * Contains all shared state, lifecycle, setters, tick/emit flow control,
 * and track allocation logic. Subclasses provide renderer-specific hooks.
 */
export abstract class DanmakuEngineBase implements DanmakuEngine {
  #destroyed = false
  #config: ResolvedConfig

  #tracks = new TrackManager()
  #scheduler = new Scheduler()
  #loop!: RafLoop

  #visible: VisibleDanmaku[] = []
  #lastTs = 0
  #lastPos = -1

  #adapter: DanmakuOptions['adapter']
  #streamLoader: StreamLoader | null = null

  // ==================================================================
  // Abstract hooks — subclasses must implement
  // ==================================================================

  /** Renderer width in CSS pixels. */
  protected abstract get rendererWidth(): number
  /** Renderer height in CSS pixels. */
  protected abstract get rendererHeight(): number
  /** Clear the rendering surface (canvas or DOM overlay). */
  protected abstract clearRenderer(): void
  /** Tear down the renderer permanently. */
  protected abstract destroyRenderer(): void
  /**
   * Called during resize(). Return true if dimensions changed
   * and tracks should be recalculated.
   */
  protected abstract updateDimensions(): boolean
  /** Measure text width using the engine's measurement strategy. */
  protected abstract measureTextWidth(text: string, family: string, size: number, weight: string): number
  /** Set v.bmp (canvas) or v.el (DOM) on the given VisibleDanmaku. */
  protected abstract renderDanmaku(v: VisibleDanmaku): void
  /** Release a single visible danmaku's engine-specific resource. */
  protected abstract releaseVisibleResource(v: VisibleDanmaku): void
  /** Release all visible danmaku resources (called by load/clear/destroy). */
  protected abstract releaseAllVisibleResources(): void
  /** Refresh visible danmaku after a config change. */
  protected abstract refreshVisibleDanmaku(): void
  /** Per-frame draw/position update. */
  protected abstract drawFrame(W: number, H: number): void

  // ==================================================================
  // Optional hooks
  // ==================================================================

  /** Called after load() completes. Canvas uses for pre-cache scheduling. */
  protected onAfterLoad(): void { /* no-op */ }
  /** Called after each tick(). Canvas uses for pre-cache scheduling. */
  protected onAfterTick(): void { /* no-op */ }
  /** Create a VisibleDanmaku object. Canvas overrides for object pooling. */
  protected acquireVisibleDanmaku(): VisibleDanmaku {
    return {} as VisibleDanmaku
  }

  // ==================================================================
  // Protected accessors for subclasses
  // ==================================================================

  protected get cfg(): ResolvedConfig {
    return this.#config
  }

  protected get visible(): VisibleDanmaku[] {
    return this.#visible
  }

  protected getPreCacheInfo(): { pool: readonly DanmakuItem[]; cursor: number } {
    return this.#scheduler.preCacheInfo()
  }

  /** Must be called by subclass constructors after renderer is initialized. */
  protected initTracks(): void {
    this.#resizeTracks()
  }

  // ==================================================================
  // Constructor
  // ==================================================================

  protected constructor(options: DanmakuOptions) {
    if (!(options.container instanceof HTMLElement)) {
      throw new TypeError('container must be an HTMLElement')
    }
    if (!options.adapter) {
      throw new TypeError('adapter is required')
    }

    this.#config = { ...SHARED_DEFAULTS, ...options } as ResolvedConfig
    this.#adapter = options.adapter

    if (options.dataSource) {
      this.#streamLoader = new StreamLoader(
        options.dataSource,
        this.#config.preBuffer,
        this.#config.leadTime,
        this.#config.seekThreshold,
        options.onError,
      )
    }

    this.#loop = new RafLoop(this.#config.fps, this.#tick)
  }

  // ==================================================================
  // Lifecycle
  // ==================================================================

  get isDestroyed(): boolean {
    return this.#destroyed
  }

  load(items: readonly DanmakuItem[]): void {
    if (this.#destroyed) return
    this.releaseAllVisibleResources()
    this.#visible = []
    this.#streamLoader?.reset()
    this.#scheduler.load(items)
    this.onAfterLoad()
  }

  send(item: DanmakuItem): void {
    if (this.#destroyed || !this.#config.enabled) return

    const pos = this.#adapter.position
    const W = this.rendererWidth
    const H = this.rendererHeight
    if (W === 0 || H === 0) return

    const scrollSpeed = (W / 8) * this.#config.speed
    const gap = Math.max(2, Math.ceil(this.#config.fontSize * 0.2))
    const th = this.#config.fontSize + this.#config.padding * 2 + gap

    const sent: DanmakuItem = { ...item, time: pos }
    this.#emit(sent, pos, scrollSpeed, th, W, H, true)
  }

  clear(): void {
    if (this.#destroyed) return
    this.releaseAllVisibleResources()
    this.#visible = []
    this.#scheduler.clear()
    this.clearRenderer()
  }

  resize(): void {
    if (this.#destroyed) return
    if (this.updateDimensions()) {
      this.#resizeTracks()
    }
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#loop.stop()
    this.#streamLoader?.destroy()
    this.releaseAllVisibleResources()
    this.#visible = []
    this.destroyRenderer()
  }

  // ==================================================================
  // Runtime setters — shared logic
  // ==================================================================

  setEnabled(v: boolean): void {
    if (this.#destroyed) return
    this.#config.enabled = v
  }

  setFps(v: number): void {
    if (this.#destroyed) return
    this.#config.fps = clamp(v, 1, 120)
    this.#loop.setFps(this.#config.fps)
  }

  setArea(v: number): void {
    if (this.#destroyed) return
    this.#config.area = clamp(v, 0, 1)
    this.#resizeTracks()
  }

  setOpacity(v: number): void {
    if (this.#destroyed) return
    this.#config.opacity = clamp(v, 0, 1)
  }

  setSpeed(v: number): void {
    if (this.#destroyed) return
    this.#config.speed = Math.max(0.1, v)
  }

  setFontFamily(v: string): void {
    if (this.#destroyed) return
    this.#config.fontFamily = v
  }

  setFontSize(v: number): void {
    if (this.#destroyed) return
    this.#config.fontSize = clamp(v, 8, 128)
    this.#resizeTracks()
  }

  setFontWeight(v: string): void {
    if (this.#destroyed) return
    this.#config.fontWeight = v
  }

  setStrokeWidth(v: number): void {
    if (this.#destroyed) return
    this.#config.strokeWidth = Math.max(0, v)
  }

  setStrokeColor(v: number): void {
    if (this.#destroyed) return
    this.#config.strokeColor = v & 0xffffff
  }

  setPadding(v: number): void {
    if (this.#destroyed) return
    this.#config.padding = Math.max(0, v)
    this.#resizeTracks()
  }

  setScrollGap(v: number): void {
    if (this.#destroyed) return
    this.#config.scrollGap = Math.max(0, v)
  }

  setDuration(v: number): void {
    if (this.#destroyed) return
    this.#config.duration = Math.max(0.5, v)
    for (let i = 0; i < this.#visible.length; i++) {
      const d = this.#visible[i]!
      if (d.mode !== DanmakuMode.Scroll) {
        d.duration = this.#config.duration
      }
    }
  }

  setOverflow(v: OverflowStrategy): void {
    if (this.#destroyed) return
    this.#config.overflow = v
  }

  setMaxVisible(v: number): void {
    if (this.#destroyed) return
    this.#config.maxVisible = Math.max(0, v)
  }

  // Engine-specific setters — default no-ops, overridden by subclasses
  setMaxCache(_v: number): void { /* no-op */ }
  setPreCacheCount(_v: number): void { /* no-op */ }
  setSmoothing(_v: boolean): void { /* no-op */ }
  setWillChange(_v: boolean): void { /* no-op */ }
  setUseTextShadow(_v: boolean): void { /* no-op */ }

  // ==================================================================
  // Internal: RAF tick
  // ==================================================================

  #tick = (ts: number): void => {
    const pos = this.#adapter.position
    const paused = this.#adapter.paused
    const W = this.rendererWidth
    const H = this.rendererHeight

    if (!this.#config.enabled || W === 0) {
      this.clearRenderer()
      return
    }

    // Pause → freeze
    if (paused) return

    // Detect seek
    const posJump = Math.abs(pos - this.#lastPos)
    if (this.#lastPos >= 0 && posJump > this.#config.seekThreshold) {
      for (let i = 0; i < this.#visible.length; i++) {
        const v = this.#visible[i]!
        this.releaseVisibleResource(v)
        if (v.mode === DanmakuMode.Scroll) this.#tracks.releaseScroll(v.track)
        else if (v.mode === DanmakuMode.Top) this.#tracks.releaseTop(v.track)
        else if (v.mode === DanmakuMode.Bottom) this.#tracks.releaseBottom(v.track)
      }
      this.#visible = []
      this.clearRenderer()
      this.#streamLoader?.reset()
    }
    this.#lastPos = pos

    // Real delta time, clamped to avoid huge jumps
    const dt = this.#lastTs ? Math.min((ts - this.#lastTs) / 1000, 0.05) : 0
    this.#lastTs = ts

    const scrollSpeed = (W / 8) * this.#config.speed
    const gap = Math.max(2, Math.ceil(this.#config.fontSize * 0.2))
    const th = this.#config.fontSize + this.#config.padding * 2 + gap

    // Emit new danmaku
    const posMs = pos * 1000
    const batch = this.#scheduler.emitBatch(posMs)
    for (let i = 0; i < batch.length; i++) {
      this.#emit(batch[i]!, pos, scrollSpeed, th, W, H)
    }

    // Update & compact
    const now = performance.now() / 1000
    const onRemove = (v: VisibleDanmaku) => {
      this.releaseVisibleResource(v)
      if (v.mode === DanmakuMode.Scroll) this.#tracks.releaseScroll(v.track)
      else if (v.mode === DanmakuMode.Top) this.#tracks.releaseTop(v.track)
      else if (v.mode === DanmakuMode.Bottom) this.#tracks.releaseBottom(v.track)
    }

    this.#visible.length = this.#scheduler.compact(this.#visible, now, dt, scrollSpeed, onRemove)

    // Draw
    this.drawFrame(W, H)

    this.onAfterTick()

    // Streaming: check coverage and fetch more
    this.#streamLoader?.probe(pos, this.#scheduler)
  }

  // ==================================================================
  // Internal: emit a single danmaku item
  // ==================================================================

  #emit(item: DanmakuItem, currentTime: number, scrollSpeed: number, th: number, W: number, H: number, force?: boolean): void {
    const mode = item.mode ?? DanmakuMode.Scroll
    const text = item.text ?? ''
    if (!text) return
    const color = item.color ?? 0xffffff
    const fs = item.font_size ?? this.#config.fontSize
    const cfg = this.#config

    // Measure text
    const tw = this.measureTextWidth(text, cfg.fontFamily, fs, cfg.fontWeight)
    const w = tw + cfg.padding * 2
    const h = fs

    // Max visible check (skipped when force)
    if (!force && cfg.maxVisible > 0 && this.#visible.length >= cfg.maxVisible) {
      if (cfg.overflow === 'drop') return
    }

    // Allocate track
    let trackResult: { track: number; y: number } | null = null

    if (mode === DanmakuMode.Scroll) {
      trackResult = this.#tracks.acquireScroll(currentTime, w, scrollSpeed, W, cfg.scrollGap)
      if (!trackResult) {
        if (cfg.overflow === 'drop' && !force) return
        const track = (Math.random() * this.#tracks.scrollTrackCount) | 0
        trackResult = { track, y: (track + 0.5) * th }
      }
    } else if (mode === DanmakuMode.Top) {
      trackResult = this.#tracks.acquireTop(currentTime, cfg.duration)
      if (!trackResult) {
        if (cfg.overflow === 'drop' && !force) return
        const track = (Math.random() * this.#tracks.topTrackCount) | 0
        trackResult = { track, y: (track + 0.5) * th }
      }
    } else if (mode === DanmakuMode.Bottom) {
      trackResult = this.#tracks.acquireBottom(currentTime, cfg.duration)
      if (!trackResult) {
        if (cfg.overflow === 'drop' && !force) return
        const track = (Math.random() * this.#tracks.bottomTrackCount) | 0
        trackResult = { track, y: H * cfg.area - (track + 0.5) * th }
      }
    } else {
      // Unknown mode → treat as scroll
      trackResult = this.#tracks.acquireScroll(currentTime, w, scrollSpeed, W, cfg.scrollGap)
      if (!trackResult) {
        if (force) {
          const track = (Math.random() * this.#tracks.scrollTrackCount) | 0
          trackResult = { track, y: (track + 0.5) * th }
        } else {
          return
        }
      }
    }

    // Create visible danmaku
    const v = this.acquireVisibleDanmaku()
    v.id = item.id
    v.text = text
    v.mode = mode
    v.color = color
    v.fontSize = fs
    v.x = mode === DanmakuMode.Scroll ? W : W / 2
    v.y = trackResult.y
    v.track = trackResult.track
    v.w = w
    v.h = h
    v.born = performance.now() / 1000
    v.duration = cfg.duration

    // Engine-specific rendering
    this.renderDanmaku(v)

    this.#visible.push(v)
  }

  // ==================================================================
  // Internal: resize tracks
  // ==================================================================

  #resizeTracks(): void {
    const H = this.rendererHeight
    if (H === 0) return
    const cfg = this.#config
    const gap = Math.max(2, Math.ceil(cfg.fontSize * 0.2))
    const th = cfg.fontSize + cfg.padding * 2 + gap
    this.#tracks.resize(H, cfg.area, th)
  }
}
import type {DanmakuEngine, DanmakuItem, DanmakuOptions, OverflowStrategy} from '../../types'
import {DanmakuMode} from '../../types'
import type {ResolvedConfig, VisibleDanmaku} from '../../types/internal'
import {CanvasRenderer} from './renderer'
import {TrackManager} from '../../core/track-manager'
import {ObjectPool} from './pool'
import {BitmapCache} from './bitmap-cache'
import {RafLoop} from '../../core/raf-loop'
import {Scheduler} from '../../core/scheduler'
import {schedulePreCache} from '../../core/pre-cache'
import {SHARED_DEFAULTS} from '../../core/defaults'
import {StreamLoader} from '../../core/stream-loader'
import {clamp} from '../../utils/math'

export class CanvasEngine implements DanmakuEngine {
  #destroyed = false
  #config: ResolvedConfig

  #renderer: CanvasRenderer
  #tracks: TrackManager
  #pool: ObjectPool
  #cache: BitmapCache
  #loop: RafLoop
  #scheduler: Scheduler

  #visible: VisibleDanmaku[] = []
  #lastTs = 0
  #cancelPreCache: (() => void) | null = null
  #adapter: DanmakuOptions['adapter']
  #streamLoader: StreamLoader | null = null

  constructor(options: DanmakuOptions) {
    if (!(options.container instanceof HTMLElement)) {
      throw new TypeError('container must be an HTMLElement')
    }
    if (!options.adapter) {
      throw new TypeError('adapter is required')
    }

    this.#config = { ...SHARED_DEFAULTS, ...options } as ResolvedConfig
    this.#adapter = options.adapter

    this.#renderer = new CanvasRenderer(options.container)
    this.#renderer.setSmoothing(this.#config.smoothing)

    this.#tracks = new TrackManager()
    this.#pool = new ObjectPool()
    this.#cache = new BitmapCache(this.#config.maxCache)
    this.#scheduler = new Scheduler()

    if (options.dataSource) {
      this.#streamLoader = new StreamLoader(
        options.dataSource,
        this.#config.preBuffer,
        this.#config.leadTime,
        this.#config.seekThreshold,
        options.onError,
      )
    }

    this.#resizeTracks()
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

    // Release all visible danmaku
    this.#pool.releaseAll(this.#visible)
    this.#visible = []

    // Clear caches
    this.#cache.clearAll()

    // Reset stream loader state (explicit load replaces streaming data)
    this.#streamLoader?.reset()

    // Load into scheduler
    this.#scheduler.load(items)

    // Schedule pre-caching
    this.#cancelPreCache?.()
    this.#cancelPreCache = null

    // Start pre-caching from current position
    this.#schedulePreCache()
  }

  send(item: DanmakuItem): void {
    if (this.#destroyed || !this.#config.enabled) return

    const pos = this.#adapter.position
    const W = this.#renderer.width
    const H = this.#renderer.height
    if (W === 0 || H === 0) return

    const scrollSpeed = (W / 8) * this.#config.speed
    const th = this.#config.fontSize + this.#config.padding * 2 + 4

    // Override time to current position so the danmaku reflects "now"
    const sent: DanmakuItem = { ...item, time: pos }
    this.#emit(sent, pos, scrollSpeed, th, W, H, true)
  }

  clear(): void {
    if (this.#destroyed) return
    this.#pool.releaseAll(this.#visible)
    this.#visible = []
    this.#scheduler.clear()
    this.#cache.clearAll()
    this.#renderer.clear()
  }

  resize(): void {
    if (this.#destroyed) return
    const ok = this.#renderer.updateDimensions()
    if (ok) {
      this.#cache.setDpr(this.#renderer.devicePixelRatio)
      this.#cache.invalidateTextCache()
      this.#resizeTracks()
    }
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#loop.stop()
    this.#cancelPreCache?.()
    this.#streamLoader?.destroy()
    this.#pool.releaseAll(this.#visible)
    this.#visible = []
    this.#cache.clearAll()
    this.#renderer.destroy()
  }

  // ==================================================================
  // Runtime setters
  // ==================================================================

  setEnabled(v: boolean): void {
    if (this.#destroyed) return
    this.#config.enabled = v
    if (!v) this.#renderer.clear()
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
    this.#cache.invalidateTextCache()
    this.#cache.clearBitmaps()
  }

  setFontSize(v: number): void {
    if (this.#destroyed) return
    this.#config.fontSize = clamp(v, 8, 128)
    this.#cache.invalidateTextCache()
    this.#cache.clearBitmaps()
  }

  setFontWeight(v: string): void {
    if (this.#destroyed) return
    this.#config.fontWeight = v
    this.#cache.invalidateTextCache()
    this.#cache.clearBitmaps()
  }

  setStrokeWidth(v: number): void {
    if (this.#destroyed) return
    this.#config.strokeWidth = Math.max(0, v)
    this.#cache.clearBitmaps()
  }

  setStrokeColor(v: number): void {
    if (this.#destroyed) return
    this.#config.strokeColor = v & 0xffffff
    this.#cache.clearBitmaps()
  }

  setPadding(v: number): void {
    if (this.#destroyed) return
    this.#config.padding = Math.max(0, v)
    this.#cache.clearBitmaps()
  }

  setDuration(v: number): void {
    if (this.#destroyed) return
    this.#config.duration = Math.max(0.5, v)
  }

  setOverflow(v: OverflowStrategy): void {
    if (this.#destroyed) return
    this.#config.overflow = v
  }

  setMaxVisible(v: number): void {
    if (this.#destroyed) return
    this.#config.maxVisible = Math.max(0, v)
  }

  setMaxCache(v: number): void {
    if (this.#destroyed) return
    this.#config.maxCache = Math.max(10, v)
    this.#cache.setMaxCache(this.#config.maxCache)
  }

  setPreCacheCount(v: number): void {
    if (this.#destroyed) return
    this.#config.preCacheCount = Math.max(0, v)
  }

  setSmoothing(v: boolean): void {
    if (this.#destroyed) return
    this.#config.smoothing = v
    this.#renderer.setSmoothing(v)
  }

  // DOM-only setters — no-ops for canvas engine
  setWillChange(_v: boolean): void { /* no-op */ }
  setUseTextShadow(_v: boolean): void { /* no-op */ }

  // ==================================================================
  // Internal: RAF tick
  // ==================================================================

  #lastPos = -1

  #tick = (ts: number): void => {
    const pos = this.#adapter.position
    const paused = this.#adapter.paused
    const W = this.#renderer.width
    const H = this.#renderer.height

    if (!this.#config.enabled || W === 0) {
      this.#renderer.clear()
      return
    }

    // Pause → freeze (keep last frame)
    if (paused) return

    // Detect seek (>200ms jump forward or backward)
    const posJump = Math.abs(pos - this.#lastPos)
    if (this.#lastPos >= 0 && posJump > this.#config.seekThreshold) {
      // Clear all visible danmaku — they belong to the old position
      for (let i = 0; i < this.#visible.length; i++) {
        const v = this.#visible[i]!
        if (v.mode === DanmakuMode.Scroll) this.#tracks.releaseScroll(v.track)
        else if (v.mode === DanmakuMode.Top) this.#tracks.releaseTop(v.track)
        else if (v.mode === DanmakuMode.Bottom) this.#tracks.releaseBottom(v.track)
        this.#pool.release(v)
      }
      this.#visible = []
      this.#renderer.clear()

      // Notify stream loader of seek
      this.#streamLoader?.reset()
    }
    this.#lastPos = pos

    // Real delta time, clamped to avoid huge jumps on seek/lag
    const dt = this.#lastTs ? Math.min((ts - this.#lastTs) / 1000, 0.05) : 0
    this.#lastTs = ts

    const scrollSpeed = (W / 8) * this.#config.speed
    const th = this.#config.fontSize + this.#config.padding * 2 + 4 // track height = fontSize + padding*2 + gap

    // --- Emit new danmaku ---
    const posMs = pos * 1000
    const batch = this.#scheduler.emitBatch(posMs)
    for (let i = 0; i < batch.length; i++) {
      this.#emit(batch[i]!, pos, scrollSpeed, th, W, H)
    }

    // --- Update & compact ---
    const now = performance.now() / 1000
    const onRemove = (v: VisibleDanmaku) => {
      // Return track
      if (v.mode === DanmakuMode.Scroll) {
        this.#tracks.releaseScroll(v.track)
      } else if (v.mode === DanmakuMode.Top) {
        this.#tracks.releaseTop(v.track)
      } else if (v.mode === DanmakuMode.Bottom) {
        this.#tracks.releaseBottom(v.track)
      }
      this.#pool.release(v)
    }

    this.#visible.length = this.#scheduler.compact(this.#visible, now, dt, scrollSpeed, onRemove)

    // --- Draw ---
    this.#renderer.clear()
    this.#renderer.setGlobalAlpha(this.#config.opacity)

    const dpr = this.#renderer.devicePixelRatio
    const pad = this.#config.padding

    for (let i = 0; i < this.#visible.length; i++) {
      const v = this.#visible[i]!
      const bmp = v.bmp
      if (!bmp) continue

      // Guard against LRU-evicted (closed) bitmaps still referenced by v.bmp
      if (!this.#cache.isAlive(bmp)) { v.bmp = undefined; continue }

      const dx = v.x | 0
      const dy = v.y | 0
      const sw = bmp.width
      const sh = bmp.height
      const dw = sw / dpr
      const dh = sh / dpr

      const ctx = this.#renderer.ctx
      if (v.mode === DanmakuMode.Scroll) {
        ctx.drawImage(bmp, 0, 0, sw, sh, dx - pad, (dy - dh / 2) | 0, dw, dh)
      } else {
        ctx.drawImage(bmp, 0, 0, sw, sh, (dx - dw / 2) | 0, (dy - dh / 2) | 0, dw, dh)
      }
    }

    // Pre-cache upcoming bitmaps
    this.#schedulePreCache()

    // Streaming: check coverage and fetch more if needed
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
    const ctx = this.#renderer.ctx

    // Measure text
    const tw = this.#cache.measure(text, cfg.fontFamily, fs, cfg.fontWeight, ctx)
    const w = tw + cfg.padding * 2
    const h = fs

    // Max visible check (skipped when force)
    if (!force && cfg.maxVisible > 0 && this.#visible.length >= cfg.maxVisible) {
      if (cfg.overflow === 'drop') return
    }

    // Allocate track
    let trackResult: { track: number; y: number } | null = null

    if (mode === DanmakuMode.Scroll) {
      trackResult = this.#tracks.acquireScroll(currentTime, w, scrollSpeed, W)
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
      trackResult = this.#tracks.acquireScroll(currentTime, w, scrollSpeed, W)
      if (!trackResult) {
        if (force) {
          const track = (Math.random() * this.#tracks.scrollTrackCount) | 0
          trackResult = { track, y: (track + 0.5) * th }
        } else {
          return
        }
      }
    }

    // Get bitmap
    const bmp = this.#cache.getBitmap(
      text, fs, color, cfg.strokeWidth, cfg.strokeColor,
      cfg.fontFamily, cfg.fontWeight,
      this.#renderer.devicePixelRatio, cfg.padding,
    )

    // Create visible danmaku
    const v = this.#pool.acquire()
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
    v.bmp = bmp

    this.#visible.push(v)
  }

  // ==================================================================
  // Internal: pre-cache scheduling
  // ==================================================================

  #schedulePreCache(): void {
    if (this.#cancelPreCache || this.#destroyed) return
    const { pool, cursor } = this.#scheduler.preCacheInfo()
    const cfg = this.#config

    this.#cancelPreCache = schedulePreCache(
      pool, cursor, cfg.preCacheCount,
      (item) => {
        const text = item.text ?? ''
        const fs = item.font_size ?? cfg.fontSize
        const color = item.color ?? 0xffffff
        // Measure
        this.#cache.measure(text, cfg.fontFamily, fs, cfg.fontWeight, this.#renderer.ctx)
        // Pre-render bitmap if not cached
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

  // ==================================================================
  // Internal: resize tracks
  // ==================================================================

  #resizeTracks(): void {
    const H = this.#renderer.height
    if (H === 0) return
    const cfg = this.#config
    const th = cfg.fontSize + cfg.padding * 2 + 4
    this.#tracks.resize(H, cfg.area, th)
  }
}

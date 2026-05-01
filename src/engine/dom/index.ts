import type { DanmakuOptions, DanmakuEngine, DanmakuItem, OverflowStrategy } from '../../types'
import type { VisibleDanmaku, ResolvedConfig } from '../../types/internal'
import { DanmakuMode } from '../../types'
import { DOMRenderer, buildTextShadow, buildDomFont } from './renderer'
import { DOMPool } from './pool'
import { TrackManager } from '../canvas/track-manager'
import { RafLoop } from '../../core/raf-loop'
import { Scheduler } from '../../core/scheduler'
import { toCss } from '../../utils/color'
import { clamp } from '../../utils/math'

const DEFAULTS: Omit<ResolvedConfig, never> = {
  enabled: true,
  fps: 60,
  area: 0.75,
  fontFamily: 'sans-serif',
  fontSize: 25,
  fontWeight: 'bold',
  opacity: 1.0,
  padding: 4,
  strokeWidth: 1.25,
  strokeColor: 0x000000,
  speed: 1.0,
  duration: 4,
  overflow: 'drop',
  maxVisible: 0,
  maxCache: 0, // not used by DOM
  preCacheCount: 0, // not used by DOM
  smoothing: true, // not used by DOM
  willChange: true,
  useTextShadow: true,
}

/**
 * DOM-based danmaku engine.
 * Uses positioned <div> elements with CSS transforms for GPU acceleration.
 * Simpler and more compatible than Canvas, but handles fewer concurrent danmaku.
 */
export class DOMEngine implements DanmakuEngine {
  #destroyed = false
  #config: ResolvedConfig

  #renderer: DOMRenderer
  #tracks: TrackManager
  #pool: DOMPool
  #loop: RafLoop
  #scheduler: Scheduler

  #visible: VisibleDanmaku[] = []
  #lastTs = 0
  #adapter: DanmakuOptions['adapter']

  constructor(options: DanmakuOptions) {
    if (!(options.container instanceof HTMLElement)) {
      throw new TypeError('container must be an HTMLElement')
    }
    if (!options.adapter) {
      throw new TypeError('adapter is required')
    }

    this.#config = { ...DEFAULTS, ...options } as ResolvedConfig
    this.#adapter = options.adapter

    this.#renderer = new DOMRenderer(options.container)
    this.#tracks = new TrackManager()
    this.#pool = new DOMPool()
    this.#scheduler = new Scheduler()

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
    this.#pool.releaseAll(this.#visible.map(v => v.el!).filter(Boolean))
    this.#visible = []
    this.#scheduler.load(items)
  }

  clear(): void {
    if (this.#destroyed) return
    this.#pool.releaseAll(this.#visible.map(v => v.el!).filter(Boolean))
    this.#visible = []
    this.#scheduler.clear()
  }

  resize(): void {
    if (this.#destroyed) return
    if (this.#renderer.width > 0) {
      this.#resizeTracks()
    }
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#loop.stop()
    this.#pool.releaseAll(this.#visible.map(v => v.el!).filter(Boolean))
    this.#visible = []
    this.#renderer.destroy()
  }

  // ==================================================================
  // Runtime setters
  // ==================================================================

  setEnabled(v: boolean): void {
    if (this.#destroyed) return
    this.#config.enabled = v
    this.#renderer.root.style.display = v ? '' : 'none'
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
    this.#renderer.root.style.opacity = String(this.#config.opacity)
  }

  setSpeed(v: number): void {
    if (this.#destroyed) return
    this.#config.speed = Math.max(0.1, v)
  }

  setFontFamily(v: string): void { this.#config.fontFamily = v }
  setFontSize(v: number): void { this.#config.fontSize = clamp(v, 8, 128) }
  setFontWeight(v: string): void { this.#config.fontWeight = v }
  setStrokeWidth(v: number): void { this.#config.strokeWidth = Math.max(0, v) }
  setStrokeColor(v: number): void { this.#config.strokeColor = v & 0xffffff }
  setPadding(v: number): void { this.#config.padding = Math.max(0, v) }
  setDuration(v: number): void { this.#config.duration = Math.max(0.5, v) }
  setOverflow(v: OverflowStrategy): void { this.#config.overflow = v }
  setMaxVisible(v: number): void { this.#config.maxVisible = Math.max(0, v) }

  // No-ops for DOM (no bitmap cache)
  setMaxCache(_v: number): void { /* no-op */ }
  setPreCacheCount(_v: number): void { /* no-op */ }

  // Canvas-only — no-ops for DOM
  setSmoothing(_v: boolean): void { /* no-op */ }

  setWillChange(v: boolean): void {
    if (this.#destroyed) return
    this.#config.willChange = v
  }

  setUseTextShadow(v: boolean): void {
    if (this.#destroyed) return
    this.#config.useTextShadow = v
  }

  // ==================================================================
  // Internal: build DOM style object for current config
  // ==================================================================

  #buildStyle(fontSize: number): string {
    const cfg = this.#config
    const font = buildDomFont(cfg.fontFamily, fontSize, cfg.fontWeight)
    const fillColor = toCss(0xffffff) // Will be overridden per-item
    const textShadow = cfg.useTextShadow
      ? buildTextShadow(cfg.strokeWidth, toCss(cfg.strokeColor))
      : 'none'
    const willChange = cfg.willChange ? 'transform' : 'auto'

    // Return a JSON-encodable style key for caching
    return `${font}|${textShadow}|${willChange}`
  }

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
      return
    }

    // Pause → freeze
    if (paused) { this.#lastPos = -1; return }

    // Detect seek (>200ms jump)
    const posJump = Math.abs(pos - this.#lastPos)
    if (this.#lastPos >= 0 && posJump > 0.2) {
      for (let i = 0; i < this.#visible.length; i++) {
        const v = this.#visible[i]!
        if (v.el) { this.#renderer.removeElement(v.el); this.#pool.release(v.el) }
        if (v.mode === DanmakuMode.Scroll) this.#tracks.releaseScroll(v.track)
        else if (v.mode === DanmakuMode.Top) this.#tracks.releaseTop(v.track)
        else if (v.mode === DanmakuMode.Bottom) this.#tracks.releaseBottom(v.track)
      }
      this.#visible = []
    }
    this.#lastPos = pos

    const dt = this.#lastTs ? Math.min((ts - this.#lastTs) / 1000, 0.05) : 0
    this.#lastTs = ts

    const scrollSpeed = (W / 8) * this.#config.speed
    const th = this.#config.fontSize + this.#config.padding * 2 + 4

    // --- Emit ---
    const posMs = pos * 1000
    const batch = this.#scheduler.emitBatch(posMs)
    for (let i = 0; i < batch.length; i++) {
      this.#emit(batch[i]!, pos, scrollSpeed, th, W, H)
    }

    // --- Update & compact ---
    const now = performance.now() / 1000
    const onRemove = (v: VisibleDanmaku) => {
      if (v.el) {
        this.#renderer.hideElement(v.el)
        this.#renderer.removeElement(v.el)
        this.#pool.release(v.el)
        v.el = undefined
      }
      if (v.mode === DanmakuMode.Scroll) {
        this.#tracks.releaseScroll(v.track)
      } else if (v.mode === DanmakuMode.Top) {
        this.#tracks.releaseTop(v.track)
      } else if (v.mode === DanmakuMode.Bottom) {
        this.#tracks.releaseBottom(v.track)
      }
    }

    const newLen = this.#scheduler.compact(this.#visible, now, dt, scrollSpeed, onRemove)
    this.#visible.length = newLen

    // --- Update positions ---
    for (let i = 0; i < this.#visible.length; i++) {
      const v = this.#visible[i]!
      if (v.el) {
        this.#renderer.positionElement(v.el, v.x, v.y, v.mode, v.h)
      }
    }
  }

  // ==================================================================
  // Internal: emit
  // ==================================================================

  #emit(item: DanmakuItem, currentTime: number, scrollSpeed: number, th: number, W: number, H: number): void {
    const mode = item.mode ?? DanmakuMode.Scroll
    const text = item.text ?? ''
    if (!text) return
    const color = item.color ?? 0xffffff
    const fs = item.font_size ?? this.#config.fontSize
    const cfg = this.#config

    // Approximate width (we don't pre-measure in DOM)
    const w = text.length * fs * 0.6 + cfg.padding * 2
    const h = fs

    // Max visible check
    if (cfg.maxVisible > 0 && this.#visible.length >= cfg.maxVisible) {
      if (cfg.overflow === 'drop') return
    }

    // Allocate track
    let trackResult: { track: number; y: number } | null = null

    if (mode === DanmakuMode.Scroll) {
      trackResult = this.#tracks.acquireScroll(currentTime, w, scrollSpeed, W)
      if (!trackResult) {
        if (cfg.overflow === 'drop') return
        const track = (Math.random() * this.#tracks.scrollTrackCount) | 0
        trackResult = { track, y: (track + 0.5) * th }
      }
    } else if (mode === DanmakuMode.Top) {
      trackResult = this.#tracks.acquireTop(currentTime, cfg.duration)
      if (!trackResult) {
        if (cfg.overflow === 'drop') return
        const track = (Math.random() * this.#tracks.topTrackCount) | 0
        trackResult = { track, y: (track + 0.5) * th }
      }
    } else if (mode === DanmakuMode.Bottom) {
      trackResult = this.#tracks.acquireBottom(currentTime, cfg.duration)
      if (!trackResult) {
        if (cfg.overflow === 'drop') return
        const track = (Math.random() * this.#tracks.bottomTrackCount) | 0
        trackResult = { track, y: H * cfg.area - (track + 0.5) * th }
      }
    } else {
      trackResult = this.#tracks.acquireScroll(currentTime, w, scrollSpeed, W)
      if (!trackResult) return
    }

    // Create DOM element
    const font = buildDomFont(cfg.fontFamily, fs, cfg.fontWeight)
    const textShadow = cfg.useTextShadow
      ? buildTextShadow(cfg.strokeWidth, toCss(cfg.strokeColor))
      : 'none'
    const willChange = cfg.willChange ? 'transform' : 'auto'

    const el = this.#pool.acquire()
    el.textContent = text
    el.style.font = font
    el.style.color = toCss(color)
    el.style.textShadow = textShadow
    el.style.willChange = willChange
    el.style.position = 'absolute'
    el.style.left = '0'
    el.style.top = '0'
    el.style.whiteSpace = 'nowrap'
    el.style.pointerEvents = 'none'
    el.style.userSelect = 'none'
    el.style.display = ''
    el.style.opacity = String(cfg.opacity)

    this.#renderer.appendElement(el)

    // Create visible danmaku
    const v: VisibleDanmaku = {
      id: item.id,
      text,
      mode,
      color,
      fontSize: fs,
      x: mode === DanmakuMode.Scroll ? W : W / 2,
      y: trackResult.y,
      track: trackResult.track,
      w,
      h,
      born: performance.now() / 1000,
      duration: cfg.duration,
      el,
    }

    this.#visible.push(v)
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

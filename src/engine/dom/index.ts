import type { DanmakuOptions, DanmakuEngine, DanmakuItem, OverflowStrategy } from '../../types'
import type { VisibleDanmaku, ResolvedConfig } from '../../types/internal'
import { DanmakuMode } from '../../types'
import { DOMRenderer, buildTextShadow, buildDomFont } from './renderer'
import { DOMPool } from './pool'
import { TrackManager } from '../../core/track-manager'
import { RafLoop } from '../../core/raf-loop'
import { Scheduler } from '../../core/scheduler'
import { SHARED_DEFAULTS } from '../../core/defaults'
import { StreamLoader } from '../../core/stream-loader'
import { toCss } from '../../utils/color'
import { clamp } from '../../utils/math'
import { measureTextWidth } from '../../utils/text-measure'


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

    this.#renderer = new DOMRenderer(options.container)
    this.#tracks = new TrackManager()
    this.#pool = new DOMPool()
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
    this.#pool.releaseAll(this.#visible.map(v => v.el!).filter(Boolean))
    this.#visible = []

    // Reset stream loader state (explicit load replaces streaming data)
    this.#streamLoader?.reset()

    this.#scheduler.load(items)
  }

  send(item: DanmakuItem): void {
    if (this.#destroyed || !this.#config.enabled) return

    const pos = this.#adapter.position
    const W = this.#renderer.width
    const H = this.#renderer.height
    if (W === 0 || H === 0) return

    const scrollSpeed = (W / 8) * this.#config.speed
    const gap = Math.max(2, Math.ceil(this.#config.fontSize * 0.2))
    const th = this.#config.fontSize + this.#config.padding * 2 + gap

    // Override time to current position so the danmaku reflects "now"
    const sent: DanmakuItem = { ...item, time: pos }
    this.#emit(sent, pos, scrollSpeed, th, W, H, true)
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
    this.#streamLoader?.destroy()
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
    for (let i = 0; i < this.#visible.length; i++) {
      const d = this.#visible[i]!
      if (d.el) d.el.style.opacity = String(this.#config.opacity)
    }
  }

  setSpeed(v: number): void {
    if (this.#destroyed) return
    this.#config.speed = Math.max(0.1, v)
  }

  setFontFamily(v: string): void {
    this.#config.fontFamily = v
    this.#refreshVisibleElements()
  }
  setFontSize(v: number): void {
    if (this.#destroyed) return
    this.#config.fontSize = clamp(v, 8, 128)
    this.#resizeTracks()
    this.#refreshVisibleElements()
  }
  setFontWeight(v: string): void {
    this.#config.fontWeight = v
    this.#refreshVisibleElements()
  }
  setStrokeWidth(v: number): void {
    this.#config.strokeWidth = Math.max(0, v)
    this.#refreshVisibleElements()
  }
  setStrokeColor(v: number): void {
    this.#config.strokeColor = v & 0xffffff
    this.#refreshVisibleElements()
  }
  setPadding(v: number): void {
    if (this.#destroyed) return
    this.#config.padding = Math.max(0, v)
    this.#resizeTracks()
    this.#refreshVisibleElements()
  }
  setDuration(v: number): void {
    this.#config.duration = Math.max(0.5, v)
    for (let i = 0; i < this.#visible.length; i++) {
      const d = this.#visible[i]!
      if (d.mode !== DanmakuMode.Scroll) {
        d.duration = this.#config.duration
      }
    }
  }
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
    this.#refreshVisibleElements()
  }

  setUseTextShadow(v: boolean): void {
    if (this.#destroyed) return
    this.#config.useTextShadow = v
    this.#refreshVisibleElements()
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

    // Pause → freeze (keep last frame, preserve #lastPos for seek detection)
    if (paused) return

    // Detect seek (>200ms jump)
    const posJump = Math.abs(pos - this.#lastPos)
    if (this.#lastPos >= 0 && posJump > this.#config.seekThreshold) {
      for (let i = 0; i < this.#visible.length; i++) {
        const v = this.#visible[i]!
        if (v.el) { this.#renderer.removeElement(v.el); this.#pool.release(v.el) }
        if (v.mode === DanmakuMode.Scroll) this.#tracks.releaseScroll(v.track)
        else if (v.mode === DanmakuMode.Top) this.#tracks.releaseTop(v.track)
        else if (v.mode === DanmakuMode.Bottom) this.#tracks.releaseBottom(v.track)
      }
      this.#visible = []

      // Notify stream loader of seek
      this.#streamLoader?.reset()
    }
    this.#lastPos = pos

    const dt = this.#lastTs ? Math.min((ts - this.#lastTs) / 1000, 0.05) : 0
    this.#lastTs = ts

    const scrollSpeed = (W / 8) * this.#config.speed
    const gap = Math.max(2, Math.ceil(this.#config.fontSize * 0.2))
    const th = this.#config.fontSize + this.#config.padding * 2 + gap

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

    // Streaming: check coverage and fetch more if needed
    this.#streamLoader?.probe(pos, this.#scheduler)
  }

  // ==================================================================
  // Internal: emit
  // ==================================================================

  #emit(item: DanmakuItem, currentTime: number, scrollSpeed: number, th: number, W: number, H: number, force?: boolean): void {
    const mode = item.mode ?? DanmakuMode.Scroll
    const text = item.text ?? ''
    if (!text) return
    const color = item.color ?? 0xffffff
    const fs = item.font_size ?? this.#config.fontSize
    const cfg = this.#config

    // Measure actual text width using a shared hidden canvas
    const tw = measureTextWidth(text, cfg.fontFamily, fs, cfg.fontWeight)
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

    // Create DOM element
    const font = buildDomFont(cfg.fontFamily, fs, cfg.fontWeight)
    const textShadow = cfg.useTextShadow
      ? buildTextShadow(cfg.strokeWidth * 0.7, toCss(cfg.strokeColor))
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
  // Internal: refresh visible elements after config change
  // ==================================================================

  #refreshVisibleElements(): void {
    const cfg = this.#config
    const textShadow = cfg.useTextShadow
      ? buildTextShadow(cfg.strokeWidth * 0.7, toCss(cfg.strokeColor))
      : 'none'
    const willChange = cfg.willChange ? 'transform' : 'auto'
    for (let i = 0; i < this.#visible.length; i++) {
      const v = this.#visible[i]!
      if (!v.el) continue
      const fs = v.fontSize
      v.el.style.font = buildDomFont(cfg.fontFamily, fs, cfg.fontWeight)
      v.el.style.color = toCss(v.color)
      v.el.style.textShadow = textShadow
      v.el.style.willChange = willChange
      v.el.style.opacity = String(cfg.opacity)
      v.w = measureTextWidth(v.text, cfg.fontFamily, fs, cfg.fontWeight) + cfg.padding * 2
      v.fontSize = cfg.fontSize
    }
  }

  // ==================================================================
  // Internal: resize tracks
  // ==================================================================

  #resizeTracks(): void {
    const H = this.#renderer.height
    if (H === 0) return
    const cfg = this.#config
    const gap = Math.max(2, Math.ceil(cfg.fontSize * 0.2))
    const th = cfg.fontSize + cfg.padding * 2 + gap
    this.#tracks.resize(H, cfg.area, th)
  }
}

import type { VisibleDanmaku } from '../../types/internal'
import { DanmakuEngineBase } from '../base'
import { DOMRenderer, buildTextShadow, buildDomFont } from './renderer'
import { DOMPool } from './pool'
import { toCss } from '../../utils/color'
import { measureTextWidth } from '../../utils/text-measure'

/**
 * DOM-based danmaku engine.
 * Uses positioned <div> elements with CSS transforms for GPU acceleration.
 * Simpler and more compatible than Canvas, but handles fewer concurrent danmaku.
 */
export class DOMEngine extends DanmakuEngineBase {
  #renderer: DOMRenderer
  #pool = new DOMPool()

  constructor(options: import('../../types').DanmakuOptions) {
    super(options)
    this.#renderer = new DOMRenderer(options.container)
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
    // No single clear — releaseAllVisibleResources handles removing elements
  }
  protected destroyRenderer(): void {
    this.#renderer.destroy()
  }
  protected updateDimensions(): boolean {
    return this.#renderer.width > 0
  }
  protected measureTextWidth(text: string, family: string, size: number, weight: string): number {
    return measureTextWidth(text, family, size, weight)
  }
  protected renderDanmaku(v: VisibleDanmaku): void {
    const cfg = this.cfg
    const font = buildDomFont(cfg.fontFamily, v.fontSize, cfg.fontWeight)
    const textShadow = cfg.useTextShadow
      ? buildTextShadow(cfg.strokeWidth * 0.7, toCss(cfg.strokeColor))
      : 'none'
    const willChange = cfg.willChange ? 'transform' : 'auto'

    const el = this.#pool.acquire()
    el.textContent = v.text
    el.style.font = font
    el.style.color = toCss(v.color)
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
    v.el = el
  }
  protected releaseVisibleResource(v: VisibleDanmaku): void {
    if (v.el) {
      this.#renderer.hideElement(v.el)
      this.#renderer.removeElement(v.el)
      this.#pool.release(v.el)
      v.el = undefined
    }
  }
  protected releaseAllVisibleResources(): void {
    const visible = this.visible
    for (let i = 0; i < visible.length; i++) {
      const v = visible[i]!
      if (v.el) {
        this.#renderer.hideElement(v.el)
        this.#renderer.removeElement(v.el)
        this.#pool.release(v.el)
        v.el = undefined
      }
    }
  }
  protected refreshVisibleDanmaku(): void {
    const cfg = this.cfg
    const textShadow = cfg.useTextShadow
      ? buildTextShadow(cfg.strokeWidth * 0.7, toCss(cfg.strokeColor))
      : 'none'
    const willChange = cfg.willChange ? 'transform' : 'auto'
    const visible = this.visible
    for (let i = 0; i < visible.length; i++) {
      const v = visible[i]!
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
  protected drawFrame(_W: number, _H: number): void {
    const visible = this.visible
    for (let i = 0; i < visible.length; i++) {
      const v = visible[i]!
      if (v.el) {
        this.#renderer.positionElement(v.el, v.x, v.y, v.mode, v.h)
      }
    }
  }

  // ==================================================================
  // Override setters with DOM-specific side effects
  // ==================================================================

  setEnabled(v: boolean): void {
    super.setEnabled(v)
    this.#renderer.root.style.display = v ? '' : 'none'
  }

  setOpacity(v: number): void {
    super.setOpacity(v)
    this.#renderer.root.style.opacity = String(this.cfg.opacity)
    const visible = this.visible
    for (let i = 0; i < visible.length; i++) {
      const d = visible[i]!
      if (d.el) d.el.style.opacity = String(this.cfg.opacity)
    }
  }

  setFontFamily(v: string): void {
    super.setFontFamily(v)
    this.refreshVisibleDanmaku()
  }

  setFontSize(v: number): void {
    super.setFontSize(v)
    this.refreshVisibleDanmaku()
  }

  setFontWeight(v: string): void {
    super.setFontWeight(v)
    this.refreshVisibleDanmaku()
  }

  setStrokeWidth(v: number): void {
    super.setStrokeWidth(v)
    this.refreshVisibleDanmaku()
  }

  setStrokeColor(v: number): void {
    super.setStrokeColor(v)
    this.refreshVisibleDanmaku()
  }

  setPadding(v: number): void {
    super.setPadding(v)
    this.refreshVisibleDanmaku()
  }

  setScrollGap(v: number) {
    super.setScrollGap(v);
    this.refreshVisibleDanmaku()
  }

  setWillChange(v: boolean): void {
    if (this.isDestroyed) return
    this.cfg.willChange = v
    this.refreshVisibleDanmaku()
  }

  setUseTextShadow(v: boolean): void {
    if (this.isDestroyed) return
    this.cfg.useTextShadow = v
    this.refreshVisibleDanmaku()
  }
}
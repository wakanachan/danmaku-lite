import {toCss} from '../../utils/color'
import {buildFont} from '../../utils/font'

interface CacheEntry {
  bitmap: ImageBitmap
  accessId: number
}

/**
 * Combined text measurement cache and ImageBitmap LRU cache.
 * Text widths are memoized by (text|fontFamily|fontSize|fontWeight).
 * Bitmaps are cached by (text|fontSize|color|strokeWidth|fontFamily|fontWeight|dpr)
 * with LRU eviction to keep GPU memory bounded.
 */
export class BitmapCache {
  // Text measurement cache
  private textWidths = new Map<string, number>()

  // ImageBitmap LRU cache
  private bitmaps = new Map<string, CacheEntry>()
  private aliveBitmaps = new Set<ImageBitmap>()
  private accessCounter = 0
  private maxCache: number
  private dpr = 1

  // Cache for buildFont result
  private cachedFont = ''
  private fontFamily = ''
  private fontSize = 0
  private fontWeight = ''

  constructor(maxCache = 500) {
    this.maxCache = maxCache
  }

  // ---- Text measurement ----

  measure(
    text: string,
    fontFamily: string,
    fontSize: number,
    fontWeight: string,
    ctx: CanvasRenderingContext2D,
  ): number {
    const key = `${text}|${fontFamily}|${fontSize}|${fontWeight}`
    const cached = this.textWidths.get(key)
    if (cached !== undefined) return cached

    ctx.font = buildFont({fontFamily, fontSize, fontWeight})
    const w = ctx.measureText(text).width
    this.textWidths.set(key, w)
    return w
  }

  invalidateTextCache(): void {
    this.textWidths.clear()
  }

  // ---- ImageBitmap cache ----

  getBitmap(
    text: string,
    fontSize: number,
    color: number,
    strokeWidth: number,
    strokeColor: number,
    fontFamily: string,
    fontWeight: string,
    dpr: number,
    padding: number,
  ): ImageBitmap {
    const key = `${text}|${fontSize}|${color}|${strokeWidth}|${strokeColor}|${fontFamily}|${fontWeight}|${dpr}`
    const hit = this.bitmaps.get(key)
    if (hit) {
      hit.accessId = ++this.accessCounter
      return hit.bitmap
    }

    // Build font
    if (fontFamily !== this.fontFamily || fontSize !== this.fontSize || fontWeight !== this.fontWeight) {
      this.fontFamily = fontFamily
      this.fontSize = fontSize
      this.fontWeight = fontWeight
      this.cachedFont = buildFont({ fontFamily, fontSize, fontWeight })
    }

    // Get text width (must already be in measure cache)
    const tw = this.textWidths.get(`${text}|${fontFamily}|${fontSize}|${fontWeight}`)
    if (tw === undefined) {
      throw new Error(`Text width not cached for "${text}". Call measure() first.`)
    }

    // CSS pixel dimensions
    const bmpW = Math.ceil(tw) + padding * 2
    const bmpH = fontSize + padding * 2

    // Physical pixel buffer for HiDPI sharpness
    const physW = (bmpW * dpr) | 0
    const physH = (bmpH * dpr) | 0
    const physPad = padding * dpr
    const physCenterY = physH / 2

    const off = new OffscreenCanvas(physW, physH)
    const c = off.getContext('2d')!
    c.font = `${fontWeight} ${fontSize * dpr}px ${fontFamily}`
    c.lineWidth = strokeWidth * dpr
    c.lineJoin = 'round'
    c.textBaseline = 'middle'
    c.textAlign = 'left'

    // Stroke
    c.strokeStyle = toCss(strokeColor)
    c.strokeText(text, physPad, physCenterY)

    // Fill
    c.fillStyle = toCss(color)
    c.fillText(text, physPad, physCenterY)

    const bmp = off.transferToImageBitmap()
    this.bitmaps.set(key, { bitmap: bmp, accessId: ++this.accessCounter })
    this.aliveBitmaps.add(bmp)

    // LRU eviction
    if (this.bitmaps.size > this.maxCache) {
      this.evictOne()
    }

    return bmp
  }

  private evictOne(): void {
    let minKey = ''
    let minAccess = Infinity
    for (const [k, v] of this.bitmaps) {
      if (v.accessId < minAccess) {
        minAccess = v.accessId
        minKey = k
      }
    }
    if (minKey) {
      const entry = this.bitmaps.get(minKey)
      if (entry) {
        this.aliveBitmaps.delete(entry.bitmap)
        entry.bitmap.close()
        this.bitmaps.delete(minKey)
      }
    }
  }

  /** Returns true if the given bitmap is still cached (not evicted/closed). */
  isAlive(bmp: ImageBitmap): boolean {
    return this.aliveBitmaps.has(bmp)
  }

  // ---- Configuration ----

  setMaxCache(n: number): void {
    this.maxCache = n
    while (this.bitmaps.size > this.maxCache) {
      this.evictOne()
    }
  }

  setDpr(dpr: number): void {
    if (this.dpr !== dpr) {
      this.dpr = dpr
      this.clearBitmaps()
    }
  }

  // ---- Cleanup ----

  clearBitmaps(): void {
    for (const [, entry] of this.bitmaps) {
      this.aliveBitmaps.delete(entry.bitmap)
      entry.bitmap.close()
    }
    this.bitmaps.clear()
  }

  clearAll(): void {
    this.clearBitmaps()
    this.textWidths.clear()
  }

  get bitmapCount(): number {
    return this.bitmaps.size
  }
}

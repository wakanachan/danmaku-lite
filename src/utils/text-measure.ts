import { buildFont } from './font'

let _ctx: CanvasRenderingContext2D | null = null

function getCtx(): CanvasRenderingContext2D {
  if (!_ctx) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    _ctx = c.getContext('2d')!
  }
  return _ctx
}

/**
 * Measure text width in CSS pixels using a shared hidden canvas.
 * Used by the DOM engine to replace the text.length * fontSize * 0.6 approximation.
 *
 * Produces exact pixel widths matching the Canvas engine's text measurement,
 * accounting for CJK characters, proportional fonts, and kerning.
 */
export function measureTextWidth(
  text: string,
  fontFamily: string,
  fontSize: number,
  fontWeight: string,
): number {
  const ctx = getCtx()
  ctx.font = buildFont({ fontFamily, fontSize, fontWeight })
  return ctx.measureText(text).width
}

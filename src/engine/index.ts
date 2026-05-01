import type { DanmakuOptions, DanmakuEngine, EngineType } from '../types'
import { CanvasEngine } from './canvas'
import { DOMEngine } from './dom'

/**
 * Create a danmaku engine instance.
 *
 * @param type — 'canvas' for high-performance 2D rendering, 'dom' for simpler CSS-based rendering
 * @param options — engine configuration (container and adapter required)
 * @returns A DanmakuEngine instance
 */
export function createEngine(type: EngineType, options: DanmakuOptions): DanmakuEngine {
  if (options.container instanceof HTMLVideoElement) {
    throw new TypeError(
      'container cannot be a <video> element. Video uses a native rendering surface ' +
      'that hides child elements. Wrap the video in a <div> and use that as the container. ' +
      'Example: <div style="position:relative"><video .../><div id="overlay"></div></div>',
    )
  }
  switch (type) {
    case 'canvas':
      return new CanvasEngine(options)
    case 'dom':
      return new DOMEngine(options)
    default:
      throw new TypeError(`Unknown engine type: "${type}". Use "canvas" or "dom".`)
  }
}

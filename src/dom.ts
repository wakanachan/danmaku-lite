// DOM-only entry point — imports only DOMEngine, no Canvas code.
// Use `import { createEngine } from 'danmaku-lite/dom'` for a smaller bundle
// when you only need the DOM backend.

import { DOMEngine } from './engine/dom'
import type { DanmakuOptions, DanmakuEngine, EngineType } from './types'

function createEngine(type: EngineType, options: DanmakuOptions): DanmakuEngine {
  if (type !== 'dom') {
    throw new TypeError('other engines are not available in dom-only package')
  }
  if (!(options.container instanceof HTMLElement)) {
    throw new TypeError('container must be an HTMLElement')
  }
  if (options.container instanceof HTMLVideoElement) {
    throw new TypeError(
      'container cannot be a <video> element. Video uses a native rendering surface ' +
      'that hides child elements. Wrap the video in a <div> and use that as the container. ' +
      'Example: <div style="position:relative"><video .../><div id="overlay"></div></div>',
    )
  }
  return new DOMEngine(options)
}

export { createEngine }
export type { PlayerAdapter } from './types/player-adapter'
export { DanmakuMode } from './types/danmaku-item'
export type { DanmakuItem } from './types/danmaku-item'
export type { DanmakuOptions, EngineType, OverflowStrategy } from './types/config'
export type { DanmakuEngine } from './types/engine'
export type { DataSourceAdapter } from './types/data-source'

import type { DanmakuMode } from './danmaku-item'

/** Visible danmaku instance after emission — has position state. */
export interface VisibleDanmaku {
  id: number | string
  text: string
  mode: DanmakuMode
  color: number
  fontSize: number
  /** Current x position in CSS pixels */
  x: number
  /** Current y position in CSS pixels */
  y: number
  /** Assigned track index */
  track: number
  /** Measured width in CSS pixels */
  w: number
  /** Measured height in CSS pixels */
  h: number
  /** Birth timestamp (performance.now() / 1000) for duration tracking */
  born: number
  /** Display duration in seconds (used for fixed danmaku) */
  duration: number
  /** Cached ImageBitmap — only used by canvas engine */
  bmp?: ImageBitmap
  /** Cached DOM element — only used by DOM engine */
  el?: HTMLDivElement
}

/** Internal config with all defaults resolved. */
export interface ResolvedConfig {
  enabled: boolean
  fps: number
  area: number
  fontFamily: string
  fontSize: number
  fontWeight: string
  opacity: number
  padding: number
  strokeWidth: number
  strokeColor: number
  speed: number
  duration: number
  overflow: 'drop' | 'none'
  maxVisible: number
  maxCache: number
  preCacheCount: number
  smoothing: boolean
  willChange: boolean
  useTextShadow: boolean
}

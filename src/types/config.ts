import type { PlayerAdapter } from './player-adapter'
import type { DataSourceAdapter } from './data-source'

export type EngineType = 'canvas' | 'dom'

export type OverflowStrategy = 'drop' | 'none'

export interface DanmakuOptions {
  // ---- Required ----
  /** The DOM element the engine renders into. Must have non-zero dimensions. */
  container: HTMLElement
  /** Adapter bridging the engine to the host media player. */
  adapter: PlayerAdapter

  // ---- General ----
  /** Whether rendering is enabled. When false, loop runs but nothing is drawn. Default: true */
  enabled?: boolean
  /** Target frames per second for the render loop. Default: 60 */
  fps?: number
  /** Fraction of container height used for danmaku (0–1). Default: 0.75 */
  area?: number

  // ---- Font / text ----
  /** CSS font-family string. Default: 'sans-serif' */
  fontFamily?: string
  /** Base font size in CSS pixels. Individual items can override via font_size. Default: 25 */
  fontSize?: number
  /** CSS font-weight value. Default: 'bold' */
  fontWeight?: string
  /** Global opacity for all danmaku (0–1). Default: 1.0 */
  opacity?: number
  /** Text bitmap padding in CSS pixels. Affects horizontal spacing. Default: 4 */
  padding?: number

  // ---- Stroke ----
  /** Text outline stroke width in CSS pixels. Default: 1.25 */
  strokeWidth?: number
  /** Stroke color as 0xRRGGBB. Default: 0x000000 (black) */
  strokeColor?: number

  // ---- Scroll behavior ----
  /** Minimum position jump (seconds) that triggers seek handling. Default: 0.2 */
  seekThreshold?: number
  /** Gap between consecutive scroll danmaku, in pixels at reference width 1920. Scaled proportionally to container width. Default: 96 */
  scrollGap?: number
  /** Playback speed multiplier. Affects scroll velocity. Default: 1.0 */
  speed?: number
  /** Fixed danmaku (mode 5/6) display duration in seconds. Default: 4 */
  duration?: number
  /** Behavior when no free track is available. 'drop' discards silently, 'none' forces emission. Default: 'drop' */
  overflow?: OverflowStrategy
  /** Maximum simultaneously visible danmaku. 0 = unlimited. Default: 0 */
  maxVisible?: number

  // ---- Cache / preload ----
  /** Maximum number of cached ImageBitmap objects. Default: 500 */
  maxCache?: number
  /** Number of items to pre-cache ahead of playback position. Default: 50 */
  preCacheCount?: number

  // ---- Canvas-specific ----
  /** Enable imageSmoothingEnabled on the canvas context. Default: true */
  smoothing?: boolean

  // ---- DOM-specific ----
  /** Add will-change: transform to danmaku elements. Disable to reduce GPU memory. Default: true */
  willChange?: boolean
  /** Use text-shadow multi-directional offset to simulate stroke. Disable for plain text. Default: true */
  useTextShadow?: boolean
  /** Called when a streaming fetch error occurs. If not set, errors are silently retried. */
  onError?: (error: Error) => void

  // ---- Data source (streaming) ----
  /**
   * Adapter for streaming danmaku data from a backend.
   * When provided, the engine manages data fetching automatically.
   * When omitted, the consumer must call load() explicitly.
   */
  dataSource?: DataSourceAdapter
  /**
   * Seconds of danmaku data to pre-buffer ahead of playback position.
   * Only used when dataSource is set. Default: 60
   */
  preBuffer?: number
  /**
   * Seconds of danmaku data to retain behind playback position.
   * Data older than (position - leadTime) is evicted from memory.
   * Default: 0 (keep all). Set to >0 for memory-constrained long sessions (e.g. live streaming).
   */
  leadTime?: number
}

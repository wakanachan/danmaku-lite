// Public entry point — re-exports the entire public API surface
export { createEngine } from './engine/index'

// Types (tree-shakeable via `import type`)
export type { PlayerAdapter } from './types/player-adapter'
export { DanmakuMode } from './types/danmaku-item'
export type { DanmakuItem } from './types/danmaku-item'
export type { DanmakuOptions, EngineType, OverflowStrategy } from './types/config'
export type { DanmakuEngine } from './types/engine'

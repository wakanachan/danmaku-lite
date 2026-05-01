# danmaku-lite

Framework-agnostic, player-agnostic danmaku (bullet chat / 弹幕) rendering engine with dual Canvas/DOM backends. Zero dependencies. ESM only.

## Features

- **Zero dependencies** — pure TypeScript, no framework required
- **Player-agnostic** — works with HTML5 `<video>`, libmpv, YouTube, custom players, WebRTC streams
- **Dual engine** — Canvas 2D (high performance, 500+ concurrent danmaku) or DOM (simple, CSS-based)
- **21 configurable parameters** — font family, stroke, speed, frame rate, area, overflow, and more
- **HiDPI** — automatic devicePixelRatio scaling on Canvas
- **O(1) track allocation** — free-track stacks with random-rotation fallback for even distribution
- **Gap-based track reuse** — tracks free up based on horizontal spacing, allowing dense danmaku
- **ImageBitmap GPU cache** — pre-rendered bitmaps with LRU eviction + alive-set leak guard
- **Seek-safe** — automatic cursor rewind on backward seeks, visible cleanup on position jumps
- **Tree-shakeable** — ESM with TypeScript declarations, minified build included

## Install

```bash
pnpm add danmaku-lite
```

## Quick Start

```typescript
import { createEngine } from 'danmaku-lite'

const engine = createEngine('canvas', {
  container: document.getElementById('overlay')!,
  adapter: {
    get position() { return video.currentTime },
    get paused() { return video.paused },
  },
  fontFamily: 'Noto Sans SC, sans-serif',
  fontSize: 28,
  strokeWidth: 1.5,
  fps: 60,
  area: 0.75,
})

engine.load([
  { id: 1, text: 'Hello!', time: 5.0, mode: 1, color: 0xffffff },
  { id: 2, text: '前方高能', time: 12.0, mode: 5, color: 0xff4444 },
])

window.addEventListener('resize', () => engine.resize())
engine.destroy()
```

## API

### `createEngine(type, options)`

Creates a danmaku engine instance.

- `type`: `'canvas'` | `'dom'`
- `options`: `DanmakuOptions` (see below)

Throws `TypeError` if `container` is a `<video>` element — wrap the video in a `<div>` instead.

### `DanmakuOptions`

| Parameter | Type | Default | Applies to |
|-----------|------|---------|-----------|
| `container` | `HTMLElement` | *required* | Both |
| `adapter` | `PlayerAdapter` | *required* | Both |
| `enabled` | `boolean` | `true` | Both |
| `fps` | `number` | `60` | Both |
| `area` | `number` | `0.75` | Both — fraction of container height (0–1). Top/bottom danmaku each get 48% of this zone |
| `fontFamily` | `string` | `'sans-serif'` | Both |
| `fontSize` | `number` | `25` | Both — base px; items can override via `font_size` |
| `fontWeight` | `string` | `'bold'` | Both |
| `opacity` | `number` | `1.0` | Both (0–1) |
| `padding` | `number` | `4` | Canvas — text bitmap padding (px) |
| `strokeWidth` | `number` | `1.25` | Both — outline width (px) |
| `strokeColor` | `number` | `0x000000` | Both — outline color (0xRRGGBB) |
| `speed` | `number` | `1.0` | Both — scroll speed multiplier |
| `duration` | `number` | `4` | Both — fixed danmaku (mode 5/6) display time (s) |
| `overflow` | `'drop' \| 'none'` | `'drop'` | Both — behavior when no track available. `'drop'` discards, `'none'` places randomly |
| `maxVisible` | `number` | `0` | Both — max simultaneous danmaku (0 = unlimited) |
| `maxCache` | `number` | `500` | Canvas — ImageBitmap LRU cache size |
| `preCacheCount` | `number` | `50` | Canvas — items to pre-render ahead of playhead |
| `smoothing` | `boolean` | `true` | Canvas — `imageSmoothingEnabled` |
| `willChange` | `boolean` | `true` | DOM — `will-change: transform` hint |
| `useTextShadow` | `boolean` | `true` | DOM — `text-shadow` outline simulation |

### `PlayerAdapter`

```typescript
interface PlayerAdapter {
  readonly position: number   // current playback position in seconds
  readonly paused: boolean    // whether playback is paused
  readonly duration?: number  // total duration in seconds (optional)
}
```

### `DanmakuEngine`

| Method | Description |
|--------|-------------|
| `load(items)` | Load/replace danmaku list (sorted by time) |
| `clear()` | Remove all visible danmaku and clear caches |
| `resize()` | Recalculate dimensions — call on container resize or fullscreen change |
| `destroy()` | Destroy engine, free all resources (idempotent) |
| `isDestroyed` | Whether `destroy()` has been called |

Runtime setters — all trigger necessary side effects (cache invalidation, track recalculation, bitmap re-render):

`setEnabled` `setFps` `setArea` `setOpacity` `setSpeed` `setFontFamily` `setFontSize` `setFontWeight` `setStrokeWidth` `setStrokeColor` `setPadding` `setDuration` `setOverflow` `setMaxVisible` `setMaxCache` `setPreCacheCount` `setSmoothing` `setWillChange` `setUseTextShadow`

### `DanmakuItem`

```typescript
interface DanmakuItem {
  id: number | string     // unique identifier
  text: string            // display text (plain string, no HTML)
  time: number            // emission time in seconds (media time)
  mode: DanmakuMode       // 1 = scroll (right-to-left), 5 = top (fixed), 6 = bottom (fixed)
  color: number           // RGB as 0xRRGGBB
  font_size?: number      // per-item font size override (px)
}
```

## Canvas vs DOM

| | Canvas | DOM |
|---|---|---|
| Concurrent danmaku | 500+ | <200 |
| Outline | Native `strokeText` | `text-shadow` (8-direction) |
| HiDPI | Manual dpr scaling | Browser-native |
| GPU path | ImageBitmap → `drawImage` | `translate3d` composite layer |
| Memory | Lower (shared canvas buffer) | Higher (per-danmaku DOM node) |
| Bitmap cache | LRU with eviction | N/A |

## Build Output

```
dist/
  index.js       48.6 KB  ESM (unminified + sourcemap)
  index.min.js   22.5 KB  ESM (minified + sourcemap)
  index.d.ts      5.2 KB  TypeScript declarations
```

No CJS — this package is browser-only. ESM is supported by all modern bundlers (Vite, webpack 5, esbuild, Rollup, Parcel).

## Browser Support

Chrome 71+, Firefox 76+, Safari 14.1+, Edge 79+.

Requires `OffscreenCanvas` (Canvas engine) or `CSSStyleDeclaration` + `transform` (DOM engine). All modern browsers since 2020.

## License

MIT
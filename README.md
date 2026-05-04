# Danmaku Lite

[![npm version](https://img.shields.io/npm/v/danmaku-lite?color=58a6ff)](https://www.npmjs.com/package/danmaku-lite)
[![minzip size](https://img.shields.io/bundlephobia/minzip/danmaku-lite)](https://bundlephobia.com/package/danmaku-lite)
[![license](https://img.shields.io/npm/l/danmaku-lite)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![ESM only](https://img.shields.io/badge/ESM-only-f7df1e?logo=javascript)](https://nodejs.org/api/esm.html)

Framework-agnostic, player-agnostic danmaku (bullet chat / 弹幕) rendering engine with dual Canvas/DOM backends. Zero dependencies. ESM only.

## Features

- **Zero dependencies** — pure TypeScript, no framework required
- **Player-agnostic** — works with HTML5 `<video>`, libmpv, YouTube, custom players, WebRTC streams
- **Dual engine** — Canvas 2D (high performance, 500+ concurrent danmaku) or DOM (simple, CSS-based)
- **25 configurable parameters** — font, stroke, speed, scroll gap, frame rate, area, overflow, and more
- **HiDPI** — automatic devicePixelRatio scaling on Canvas
- **O(1) track allocation** — free-track stacks with random-rotation fallback for even distribution
- **Configurable scroll gap** — reference-width-based gap between scroll danmaku, scaled proportionally to container
- **ImageBitmap GPU cache** — pre-rendered bitmaps with LRU eviction + alive-set leak guard
- **Seek-safe** — automatic cursor rewind on backward seeks, visible cleanup on position jumps
- **Streaming loading** — engine-managed incremental fetch via user-provided `DataSourceAdapter`; supports VOD, live, and local playback
- **send() API** — temporarily display a single danmaku on send success; bypasses visibility caps
- **Tree-shakeable** — ESM with TypeScript declarations, minified build included

## Quick Start

### Install

```bash
#npm
npm install danmaku-lite
# pnpm
pnpm add danmaku-lite
# yarn
yarn add danmaku-lite
```

### Static Loading (VOD / local playback)

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
```

### Streaming Loading (VOD / live streaming)

```typescript
import { createEngine } from 'danmaku-lite'

const engine = createEngine('canvas', {
  container: document.getElementById('overlay')!,
  adapter: {
    get position() { return video.currentTime },
    get paused() { return video.paused },
  },
  // User-provided data source — engine decides when to fetch
  dataSource: {
    async fetch(start, end) {
      const res = await fetch(`/api/danmaku?start=${start}&end=${end}`)
      return res.json()
    },
  },
  preBuffer: 60,   // keep 60s of danmaku ahead of playhead
  leadTime: 30,    // evict items older than 30s behind playhead
})

// Engine fetches automatically — no need to call load().
// Call load() to seed initial data or replace content:
engine.load([{ id: 0, text: 'seeded!', time: 0, mode: 1, color: 0xffffff }])
```

### Send Danmaku (on send success)

```typescript
// User clicks send → your app POSTs to backend → on success:
engine.send({
  id: `user-${Date.now()}`,
  text: 'Hello from user!',
  time: video.currentTime,  // overridden to current position
  mode: 1,                   // 1=Scroll, 5=Top, 6=Bottom
  color: 0xff8800,
})

// The danmaku appears immediately, regardless of maxVisible / overflow settings.
// It follows the normal lifecycle (scrolls off-screen or expires) and is cleaned up.
```

### Cleanup

```typescript
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
| `scrollGap` | `number` | `96` | Both — scroll danmaku gap at reference width 1920px, scaled proportionally |
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
| `seekThreshold` | `number` | `0.2` | Both — minimum position jump (s) that triggers seek clear |
| `onError` | `(error: Error) => void` | `undefined` | Both — called on streaming fetch errors |
| `dataSource` | `DataSourceAdapter` | `undefined` | Both — enables streaming mode |
| `preBuffer` | `number` | `60` | Both — seconds ahead to pre-fetch (streaming mode) |
| `leadTime` | `number` | `0` | Both — seconds behind to retain; older items evicted (0 = keep all) |

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
| `load(items)` | Load/replace danmaku list (sorted by time). In streaming mode, resets the stream loader. |
| `clear()` | Remove all visible danmaku and clear caches |
| `resize()` | Recalculate dimensions — call on container resize or fullscreen change |
| `destroy()` | Destroy engine, free all resources (idempotent) |
| `send(item)` | Temporarily display a single danmaku at the current playback position. Bypasses `maxVisible` and `overflow: drop`. Use after a successful send to show the user's message immediately. |
| `isDestroyed` | Whether `destroy()` has been called |

Runtime setters — all trigger necessary side effects (cache invalidation, track recalculation, bitmap re-render):

`setEnabled` `setFps` `setArea` `setOpacity` `setSpeed` `setFontFamily` `setFontSize` `setFontWeight` `setStrokeWidth` `setStrokeColor` `setPadding` `setScrollGap` `setDuration` `setOverflow` `setMaxVisible` `setMaxCache` `setPreCacheCount` `setSmoothing` `setWillChange` `setUseTextShadow`

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

### `DataSourceAdapter`

User-provided adapter for streaming danmaku data. When provided via `dataSource` option, the engine manages data fetching automatically.

```typescript
interface DataSourceAdapter {
  /**
   * Fetch danmaku items for a given time range.
   *
   * @param start - Start time in seconds (inclusive)
   * @param end   - End time in seconds (exclusive). May be Infinity
   *                for live streaming where the end is unknown.
   * @returns Items in this range. Need not be sorted. May be empty.
   */
  fetch(start: number, end: number): Promise<DanmakuItem[]>
}
```

**Scenarios:**

| Scenario | Adapter behavior | Config |
|----------|-----------------|--------|
| **Local player** | `fetch(0, duration)` called once; all data loaded upfront | `preBuffer: 0` |
| **Online VOD** | `fetch()` called in segments as playback progresses | `preBuffer: 60`, `leadTime: 0` |
| **Live streaming** | `fetch(lastPos, Infinity)` called continuously; returns current items | `preBuffer: 30`, `leadTime: 60` |

**How it works:**
1. Engine calls `probe(position)` every frame
2. If the current playback position + `preBuffer` extends beyond already-fetched ranges, a new `fetch()` is triggered
3. Fetched items are merged into the scheduler via `scheduler.add()`
4. On seek, in-flight fetches are cancelled and ranges are reset
5. If `leadTime > 0`, items older than `position - leadTime` are evicted from memory

**Streaming + `load()` coexistence:**
Calling `load()` while streaming is active resets the stream loader (clears range cache, cancels in-flight requests) and replaces the scheduler pool with the explicit items. The stream loader resumes on the next tick from the current position.

## Canvas vs DOM

| | Canvas | DOM |
|---|---|---|
| Concurrent danmaku | 500+ | <200 |
| Outline | Native `strokeText` | `text-shadow` (8-direction) |
| HiDPI | Manual dpr scaling | Browser-native |
| GPU path | ImageBitmap → `drawImage` | `translate3d` composite layer |
| Memory | Lower (shared canvas buffer) | Higher (per-danmaku DOM node) |
| Bitmap cache | LRU with eviction | N/A |

## Tree-shakeable Entry Points
![npm package minimized gzipped size](https://img.shields.io/bundlejs/size/danmaku-lite?label=full)
![npm package minimized gzipped size](https://img.shields.io/bundlejs/size/danmaku-lite%2Fcanvas?label=canvas)
![npm package minimized gzipped size](https://img.shields.io/bundlejs/size/danmaku-lite%2Fdom?label=dom)

Import only the engine you need for a smaller bundle:

```typescript
// Full (both engines)
import { createEngine } from 'danmaku-lite'

// Canvas only
import { createEngine } from 'danmaku-lite/canvas'

// DOM only
import { createEngine } from 'danmaku-lite/dom'
```

All three entry points export the same public API. The per-engine entries omit the unused backend entirely.

## Demo

```bash
git clone https://github.com/wakanachan/danmaku-lite.git
cd danmaku-lite
pnpm install
pnpm build && pnpm dlx serve -l 3030 # http://localhost:3030/demo/
```

## Build Output

```
dist/
  index.js       ESM full (unminified + sourcemap)
  index.min.js   ESM full (minified + sourcemap)
  canvas.js      ESM canvas-only (unminified + sourcemap)
  canvas.min.js  ESM canvas-only (minified + sourcemap)
  dom.js         ESM dom-only (unminified + sourcemap)
  dom.min.js     ESM dom-only (minified + sourcemap)
  index.d.ts     TypeScript declarations
```

No CJS — this package is browser-only. ESM is supported by all modern bundlers (Vite, webpack 5, esbuild, Rollup, Parcel).

## Browser Support

Chrome 71+, Firefox 76+, Safari 14.1+, Edge 79+.

Requires `OffscreenCanvas` (Canvas engine) or `CSSStyleDeclaration` + `transform` (DOM engine). All modern browsers since 2020.

## License

MIT
/**
 * O(1) track allocator for scroll, top, and bottom danmaku.
 * Uses free-track stacks to avoid linear scanning when possible.
 */
export class TrackManager {
  // Scroll tracks (mode 1)
  private scrollCount = 0
  private scrollFree: number[] = []
  private scrollExit: Float64Array = new Float64Array(0)

  // Top tracks (mode 5)
  private topCount = 0
  private topFree: number[] = []
  private topExit: Float64Array = new Float64Array(0)

  // Bottom tracks (mode 6)
  private bottomCount = 0
  private bottomFree: number[] = []
  private bottomExit: Float64Array = new Float64Array(0)

  /** Container height, track height, area fraction (cached for y calculations) */
  private H = 0
  private th = 0
  private areaFraction = 0.75

  // ---- Resize ----

  resize(containerHeight: number, area: number, trackHeight: number): void {
    this.H = containerHeight
    this.th = trackHeight
    this.areaFraction = area
    const areaHeight = containerHeight * area
    const totalTracks = Math.max(1, Math.floor(areaHeight / trackHeight))
    // Fixed danmaku: top 48% of area for mode 5, bottom 48% of area for mode 6
    const fixedTracks = Math.max(1, Math.floor(areaHeight * 0.48 / trackHeight))

    this.scrollCount = totalTracks
    this.topCount = fixedTracks
    this.bottomCount = fixedTracks

    this.scrollExit = new Float64Array(totalTracks).fill(-Infinity)
    this.topExit = new Float64Array(fixedTracks).fill(-Infinity)
    this.bottomExit = new Float64Array(fixedTracks).fill(-Infinity)

    this.scrollFree = Array.from({ length: totalTracks }, (_, i) => i)
    this.topFree = Array.from({ length: fixedTracks }, (_, i) => i)
    this.bottomFree = Array.from({ length: fixedTracks }, (_, i) => i)
  }

  // ---- Scroll track allocation (mode 1) ----

  acquireScroll(currentTime: number, danmakuWidth: number, speed: number, containerWidth: number, scrollGap: number): { track: number; y: number } | null {
    // O(1): pop from free stack first, defer unavailable tracks instead of discarding
    const deferred: number[] = []
    while (this.scrollFree.length > 0) {
      const t = this.scrollFree.pop()!
      if (this.scrollExit[t]! <= currentTime) {
        this.scrollExit[t] = currentTime + (danmakuWidth + scrollGap * containerWidth / 1920) / speed
        // Push deferred tracks back so they can be tried next time
        for (const d of deferred) this.scrollFree.push(d)
        return { track: t, y: this.scrollY(t) }
      }
      deferred.push(t)
    }
    // Push deferred back before fallback scan
    for (const d of deferred) this.scrollFree.push(d)

    // Fallback linear scan — start at random offset so top tracks don't dominate
    const offset = (Math.random() * this.scrollCount) | 0
    for (let j = 0; j < this.scrollCount; j++) {
      const i = (offset + j) % this.scrollCount
      if (this.scrollExit[i]! <= currentTime) {
        this.scrollExit[i] = currentTime + (danmakuWidth + scrollGap * containerWidth / 1920) / speed
        // Remove track from free stack so it doesn't accumulate duplicates
        const idx = this.scrollFree.indexOf(i)
        if (idx !== -1) this.scrollFree.splice(idx, 1)
        return { track: i, y: this.scrollY(i) }
      }
    }
    return null
  }

  releaseScroll(track: number): void {
    this.scrollExit[track] = -Infinity
    // Only push if not already in free stack
    if (!this.scrollFree.includes(track)) {
      this.scrollFree.push(track)
    }
  }

  // ---- Top track allocation (mode 5) ----

  acquireTop(currentTime: number, duration: number): { track: number; y: number } | null {
    const deferred: number[] = []
    while (this.topFree.length > 0) {
      const t = this.topFree.pop()!
      if (this.topExit[t]! <= currentTime) {
        this.topExit[t] = currentTime + duration
        for (const d of deferred) this.topFree.push(d)
        return { track: t, y: this.fixedY(t, true) }
      }
      deferred.push(t)
    }
    for (const d of deferred) this.topFree.push(d)

    const offset = (Math.random() * this.topCount) | 0
    for (let j = 0; j < this.topCount; j++) {
      const i = (offset + j) % this.topCount
      if (this.topExit[i]! <= currentTime) {
        this.topExit[i] = currentTime + duration
        const idx = this.topFree.indexOf(i)
        if (idx !== -1) this.topFree.splice(idx, 1)
        return { track: i, y: this.fixedY(i, true) }
      }
    }
    return null
  }

  releaseTop(track: number): void {
    this.topExit[track] = -Infinity
    if (!this.topFree.includes(track)) {
      this.topFree.push(track)
    }
  }

  // ---- Bottom track allocation (mode 6) ----

  acquireBottom(currentTime: number, duration: number): { track: number; y: number } | null {
    const deferred: number[] = []
    while (this.bottomFree.length > 0) {
      const t = this.bottomFree.pop()!
      if (this.bottomExit[t]! <= currentTime) {
        this.bottomExit[t] = currentTime + duration
        for (const d of deferred) this.bottomFree.push(d)
        return { track: t, y: this.fixedY(t, false) }
      }
      deferred.push(t)
    }
    for (const d of deferred) this.bottomFree.push(d)

    const offset = (Math.random() * this.bottomCount) | 0
    for (let j = 0; j < this.bottomCount; j++) {
      const i = (offset + j) % this.bottomCount
      if (this.bottomExit[i]! <= currentTime) {
        this.bottomExit[i] = currentTime + duration
        const idx = this.bottomFree.indexOf(i)
        if (idx !== -1) this.bottomFree.splice(idx, 1)
        return { track: i, y: this.fixedY(i, false) }
      }
    }
    return null
  }

  releaseBottom(track: number): void {
    this.bottomExit[track] = -Infinity
    if (!this.bottomFree.includes(track)) {
      this.bottomFree.push(track)
    }
  }

  get scrollTrackCount(): number { return this.scrollCount }
  get topTrackCount(): number { return this.topCount }
  get bottomTrackCount(): number { return this.bottomCount }

  // ---- Y position helpers ----

  private scrollY(track: number): number {
    return (track + 0.5) * this.th
  }

  private fixedY(track: number, isTop: boolean): number {
    if (isTop) {
      return (track + 0.5) * this.th
    }
    // Bottom tracks stack upward from the bottom of the area zone (not the container)
    return this.H * this.areaFraction - (track + 0.5) * this.th
  }
}

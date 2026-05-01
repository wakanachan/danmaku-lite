import type { VisibleDanmaku } from '../../types/internal'

const MAX_POOL_SIZE = 512

/**
 * Object pool for VisibleDanmaku instances — avoids GC pressure
 * by recycling objects instead of allocating new ones.
 */
export class ObjectPool {
  private pool: VisibleDanmaku[] = []

  acquire(): VisibleDanmaku {
    return this.pool.length > 0 ? this.pool.pop()! : {} as VisibleDanmaku
  }

  release(v: VisibleDanmaku): void {
    if (this.pool.length < MAX_POOL_SIZE) {
      // Null out references to allow GC of bitmap / DOM element
      v.bmp = undefined
      v.el = undefined
      this.pool.push(v)
    }
  }

  releaseAll(visible: VisibleDanmaku[]): void {
    for (let i = 0; i < visible.length; i++) {
      this.release(visible[i]!)
    }
  }

  get size(): number {
    return this.pool.length
  }
}

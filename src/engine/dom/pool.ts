const MAX_POOL_SIZE = 512

/**
 * Object pool for HTMLDivElement instances — avoids DOM creation overhead.
 */
export class DOMPool {
  private pool: HTMLDivElement[] = []

  acquire(): HTMLDivElement {
    return this.pool.length > 0 ? this.pool.pop()! : document.createElement('div')
  }

  release(el: HTMLDivElement): void {
    if (this.pool.length < MAX_POOL_SIZE) {
      // Hide and detach, but keep for reuse
      el.style.display = 'none'
      if (el.parentNode) el.parentNode.removeChild(el)
      // Reset transform to avoid stale positioning
      el.style.transform = ''
      el.textContent = ''
      this.pool.push(el)
    }
  }

  releaseAll(elements: HTMLDivElement[]): void {
    for (let i = 0; i < elements.length; i++) {
      this.release(elements[i]!)
    }
  }

  get size(): number {
    return this.pool.length
  }
}

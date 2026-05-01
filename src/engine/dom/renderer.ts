/**
 * DOM-based renderer — manages the overlay container and creates/styled danmaku divs.
 */

export interface DomStyle {
  font: string
  fillColor: string
  textShadow: string
  willChange: string
}

/**
 * Build the text-shadow CSS value for stroke simulation.
 * Multi-directional offsets create an outline effect.
 */
export function buildTextShadow(width: number, strokeColor: string): string {
  const s = width
  return [
    `-${s}px -${s}px 0 ${strokeColor}`,
    `0px -${s}px 0 ${strokeColor}`,
    `${s}px -${s}px 0 ${strokeColor}`,
    `-${s}px 0px 0 ${strokeColor}`,
    `${s}px 0px 0 ${strokeColor}`,
    `-${s}px ${s}px 0 ${strokeColor}`,
    `0px ${s}px 0 ${strokeColor}`,
    `${s}px ${s}px 0 ${strokeColor}`,
  ].join(',')
}

/**
 * Build CSS font shorthand from engine config.
 */
export function buildDomFont(
  fontFamily: string,
  fontSize: number,
  fontWeight: string,
): string {
  return `${fontWeight} ${fontSize}px ${fontFamily}`
}

/**
 * Manages the DOM overlay and danmaku element styling.
 */
export class DOMRenderer {
  readonly root: HTMLDivElement
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container

    const root = document.createElement('div')
    root.style.position = 'absolute'
    root.style.inset = '0'
    root.style.overflow = 'hidden'
    root.style.pointerEvents = 'none'
    root.style.userSelect = 'none'
    container.appendChild(root)

    this.root = root
  }

  get width(): number {
    return this.container.clientWidth
  }
  get height(): number {
    return this.container.clientHeight
  }

  /**
   * Create a new danmaku DOM element pre-styled for reuse.
   */
  createElement(style: DomStyle): HTMLDivElement {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    el.style.left = '0'
    el.style.top = '0'
    el.style.whiteSpace = 'nowrap'
    el.style.font = style.font
    el.style.color = style.fillColor
    el.style.textShadow = style.textShadow
    el.style.willChange = style.willChange
    el.style.pointerEvents = 'none'
    el.style.userSelect = 'none'
    return el
  }

  /**
   * Update a reused element's styling to match a new danmaku.
   */
  configureElement(el: HTMLDivElement, text: string, style: DomStyle): void {
    el.textContent = text
    el.style.font = style.font
    el.style.color = style.fillColor
    el.style.textShadow = style.textShadow
    el.style.willChange = style.willChange
  }

  /**
   * Position the element using GPU-accelerated transform.
   * Mode 1 (scroll): x is the left edge.
   * Mode 5/6 (fixed): x is the horizontal center; we center via translate + left: 50%.
   */
  positionElement(el: HTMLDivElement, x: number, y: number, mode: number, height: number): void {
    const rx = Math.round(x)
    const ry = Math.round(y - height / 2)

    if (mode === 1) {
      el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`
    } else {
      // Fixed danmaku: x is center, so we need a different approach
      // Center the element at x
      el.style.transform = `translate3d(${rx}px, ${ry}px, 0) translateX(-50%)`
    }
  }

  hideElement(el: HTMLDivElement): void {
    el.style.display = 'none'
  }

  showElement(el: HTMLDivElement): void {
    el.style.display = ''
  }

  appendElement(el: HTMLDivElement): void {
    this.root.appendChild(el)
  }

  removeElement(el: HTMLDivElement): void {
    if (el.parentNode === this.root) {
      this.root.removeChild(el)
    }
  }

  destroy(): void {
    this.root.remove()
  }
}

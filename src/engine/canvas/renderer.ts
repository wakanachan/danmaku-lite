/**
 * Manages the <canvas> element and provides draw methods.
 * All coordinates are in CSS pixels; HiDPI scaling is handled internally.
 */
export class CanvasRenderer {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D

  private container: HTMLElement
  private W = 0
  private H = 0
  private dpr = 1

  constructor(container: HTMLElement) {
    this.container = container

    const canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.pointerEvents = 'none'
    container.appendChild(canvas)

    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.updateDimensions()
  }

  /** Re-measure container and resize the canvas backing store. */
  updateDimensions(): boolean {
    const dpr = window.devicePixelRatio || 1
    const W = this.container.clientWidth
    const H = this.container.clientHeight

    if (W === 0 || H === 0) return false

    this.dpr = dpr
    this.W = W
    this.H = H

    this.canvas.width = W * dpr
    this.canvas.height = H * dpr
    this.canvas.style.width = W + 'px'
    this.canvas.style.height = H + 'px'
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    return true
  }

  get width(): number {
    return this.W
  }
  get height(): number {
    return this.H
  }
  get devicePixelRatio(): number {
    return this.dpr
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.W, this.H)
  }

  setSmoothing(enabled: boolean): void {
    this.ctx.imageSmoothingEnabled = enabled
  }

  setGlobalAlpha(alpha: number): void {
    this.ctx.globalAlpha = alpha
  }

  destroy(): void {
    this.canvas.remove()
  }
}

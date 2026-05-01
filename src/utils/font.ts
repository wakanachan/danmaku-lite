export interface FontOptions {
  fontFamily: string
  fontSize: number
  fontWeight: string
}

/** Build a CSS font shorthand string for canvas context. */
export function buildFont({ fontFamily, fontSize, fontWeight }: FontOptions): string {
  return `${fontWeight} ${fontSize}px ${fontFamily}`
}

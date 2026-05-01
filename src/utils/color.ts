/**
 * Convert 0xRRGGBB number to CSS color string.
 * Returns '#000000' for invalid/negative values.
 */
export function toCss(color: number): string {
  if (color < 0 || color > 0xffffff || !Number.isFinite(color)) {
    return '#000000'
  }
  return '#' + color.toString(16).padStart(6, '0')
}

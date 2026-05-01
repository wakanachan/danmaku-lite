/** Create an HTML element with styles applied in one pass. */
export function createStyledElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles: Partial<CSSStyleDeclaration>,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(styles)) {
    if (value !== undefined && value !== null) {
      el.style.setProperty(key, String(value))
    }
  }
  return el
}

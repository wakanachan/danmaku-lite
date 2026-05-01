import { describe, it, expect } from 'vitest'
import { toCss } from '../../src/utils/color'

describe('toCss', () => {
  it('converts white', () => {
    expect(toCss(0xffffff)).toBe('#ffffff')
  })

  it('converts black', () => {
    expect(toCss(0x000000)).toBe('#000000')
  })

  it('converts red', () => {
    expect(toCss(0xff0000)).toBe('#ff0000')
  })

  it('pads to 6 digits', () => {
    expect(toCss(0xff)).toBe('#0000ff')
  })

  it('returns black for negative values', () => {
    expect(toCss(-1)).toBe('#000000')
  })

  it('returns black for NaN', () => {
    expect(toCss(NaN)).toBe('#000000')
  })

  it('returns black for Infinity', () => {
    expect(toCss(Infinity)).toBe('#000000')
  })

  it('returns black for values above 0xffffff', () => {
    expect(toCss(0x1000000)).toBe('#000000')
  })
})

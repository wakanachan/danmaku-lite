import { describe, it, expect } from 'vitest'
import { buildFont } from '../../src/utils/font'

describe('buildFont', () => {
  it('builds a CSS font string', () => {
    expect(buildFont({ fontFamily: 'Arial', fontSize: 25, fontWeight: 'bold' })).toBe(
      'bold 25px Arial',
    )
  })

  it('handles normal weight', () => {
    expect(buildFont({ fontFamily: 'sans-serif', fontSize: 18, fontWeight: 'normal' })).toBe(
      'normal 18px sans-serif',
    )
  })
})

import { describe, it, expect } from 'vitest'
import { clamp, lerp, binarySearch } from '../../src/utils/math'

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('returns min when below', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })

  it('returns max when above', () => {
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('handles edge case where min equals max', () => {
    expect(clamp(5, 7, 7)).toBe(7)
  })
})

describe('lerp', () => {
  it('interpolates at t=0', () => {
    expect(lerp(0, 10, 0)).toBe(0)
  })

  it('interpolates at t=1', () => {
    expect(lerp(0, 10, 1)).toBe(10)
  })

  it('interpolates at midpoint', () => {
    expect(lerp(0, 10, 0.5)).toBe(5)
  })
})

describe('binarySearch', () => {
  it('finds insertion point in the middle', () => {
    const arr = [1, 3, 5, 7, 9]
    expect(binarySearch(arr, 4, (x) => x)).toBe(2)
  })

  it('returns 0 when target before all', () => {
    const arr = [3, 5, 7]
    expect(binarySearch(arr, 1, (x) => x)).toBe(0)
  })

  it('returns length when target after all', () => {
    const arr = [1, 3, 5]
    expect(binarySearch(arr, 10, (x) => x)).toBe(3)
  })

  it('handles empty array', () => {
    expect(binarySearch([], 5, (x) => x)).toBe(0)
  })

  it('uses accessor function', () => {
    const arr = [{ t: 1 }, { t: 3 }, { t: 5 }]
    expect(binarySearch(arr, 2, (x) => x.t)).toBe(1)
  })

  it('handles duplicates by inserting after', () => {
    const arr = [1, 3, 3, 5]
    expect(binarySearch(arr, 3, (x) => x)).toBe(3)
  })
})

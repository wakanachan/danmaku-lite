import { describe, it, expect } from 'vitest'
import { createStyledElement } from '../../src/utils/dom'

describe('createStyledElement', () => {
  it('creates an element with the correct tag', () => {
    const el = createStyledElement('div', {})
    expect(el.tagName).toBe('DIV')
  })

  it('applies styles', () => {
    const el = createStyledElement('span', {
      position: 'absolute',
      color: 'red',
    })
    expect(el.style.position).toBe('absolute')
    expect(el.style.color).toBe('red')
  })

  it('skips undefined values', () => {
    const el = createStyledElement('div', {
      position: 'absolute',
      top: undefined as unknown as string,
    })
    expect(el.style.position).toBe('absolute')
    expect(el.style.top).toBe('')
  })
})

import { describe, it, expect } from 'vitest'
import { ObjectPool } from '../../src/engine/canvas/pool'

describe('ObjectPool', () => {
  it('acquire returns an object', () => {
    const pool = new ObjectPool()
    const v = pool.acquire()
    expect(v).toBeDefined()
    expect(typeof v).toBe('object')
  })

  it('releases and reuses objects', () => {
    const pool = new ObjectPool()
    const v1 = pool.acquire()
    v1.id = 'test'
    pool.release(v1)

    const v2 = pool.acquire()
    expect(v2).toBe(v1) // same object reference
    expect(v2.id).toBe('test') // carries old data (caller must reset)
  })

  it('clears bmp and el references on release', () => {
    const pool = new ObjectPool()
    const v = pool.acquire()
    v.bmp = {} as ImageBitmap
    v.el = {} as HTMLDivElement
    pool.release(v)
    expect(v.bmp).toBeUndefined()
    expect(v.el).toBeUndefined()
  })

  it('releaseAll releases all items', () => {
    const pool = new ObjectPool()
    const items = [pool.acquire(), pool.acquire(), pool.acquire()]
    pool.releaseAll(items)

    // All 3 should be back in pool
    const a1 = pool.acquire()
    const a2 = pool.acquire()
    const a3 = pool.acquire()
    // They should be reused instances
    expect(items).toContain(a1)
    expect(items).toContain(a2)
    expect(items).toContain(a3)
  })
})

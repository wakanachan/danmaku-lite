// Polyfill requestIdleCallback / cancelIdleCallback for older browsers.
// Uses requestAnimationFrame for more accurate idle-time scheduling,
// with a setTimeout fallback for the `timeout` option.

interface MutableIdleDeadline {
  didTimeout: boolean
  timeRemaining(): number
}

interface CompositeId {
  rafId: number
  timeoutId: ReturnType<typeof setTimeout> | 0
}

// eslint-disable-next-line no-underscore-dangle
const _ids = new Map<number, CompositeId>()

if (typeof window !== 'undefined' && !window.requestIdleCallback) {
  window.requestIdleCallback = function (callback, options) {
    const timeout = options?.timeout
    let start = Date.now()
    let timerId: ReturnType<typeof setTimeout> | 0 = 0

    const idleDeadline: MutableIdleDeadline = {
      didTimeout: false,
      timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
    }

    // Timeout fallback: if the callback doesn't get scheduled by the
    // next idle frame, fire it anyway with didTimeout=true.
    if (timeout != null) {
      timerId = setTimeout(() => {
        idleDeadline.didTimeout = true
        start = Date.now()
        callback(idleDeadline as IdleDeadline)
      }, timeout)
    }

    // Schedule via RAF — runs during the next idle period before the
    // next paint, which more closely matches the real requestIdleCallback
    // timing than a bare setTimeout(..., 1).
    const rafId = requestAnimationFrame(() => {
      if (timeout != null) clearTimeout(timerId)
      if (idleDeadline.didTimeout) return
      start = Date.now()
      callback(idleDeadline as IdleDeadline)
    })

    // Store composite ID so cancelIdleCallback can cancel both RAF and timeout.
    const handle = Date.now() + Math.random()
    _ids.set(handle, { rafId, timeoutId: timerId })
    return handle
  }

  window.cancelIdleCallback = function (handle) {
    const ids = _ids.get(handle)
    if (ids) {
      cancelAnimationFrame(ids.rafId)
      if (ids.timeoutId) clearTimeout(ids.timeoutId)
      _ids.delete(handle)
    }
  }
}
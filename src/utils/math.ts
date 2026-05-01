/** Clamp value between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Linear interpolation between a and b by t (0–1). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Binary search for the insertion point of `target` in a sorted array.
 * Returns the index of the first element where `value > target`, or `arr.length` if all <= target.
 * The accessor function extracts the numeric key from each element.
 */
export function binarySearch<T>(
  arr: readonly T[],
  target: number,
  accessor: (item: T) => number,
  lo = 0,
  hi = arr.length,
): number {
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (accessor(arr[mid]!) <= target) lo = mid + 1
    else hi = mid
  }
  return lo
}

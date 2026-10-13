/** Index of the last element <= x in a sorted array, or -1 if x < arr[0]. */
export function lowerIndex(arr: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  if (hi < 0 || x < arr[0]) return -1;
  if (x >= arr[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

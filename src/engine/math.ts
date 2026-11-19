/**
 * Smallest k with 2^k >= n, for a row count n >= 0.
 * The cost model charges a sort of n rows as n * ceilLog2(n).
 */
export function ceilLog2(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`ceilLog2 expects a non-negative integer, got ${String(n)}`);
  }
  // log2(0) is -Infinity; every other n, including 1, needs no special case.
  if (n === 0) {
    return 0;
  }
  return Math.ceil(Math.log2(n));
}

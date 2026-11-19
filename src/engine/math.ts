/**
 * Smallest k with 2^k >= n, for a row count n >= 0, and 0 for n <= 1.
 * The cost model charges a sort of n rows as n * ceilLog2(n).
 */
export function ceilLog2(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`ceilLog2 expects a non-negative safe integer, got ${String(n)}`);
  }
  // Doubling is exact up to 2^53, while Math.log2 rounds: Math.log2(2^50 + 1)
  // is exactly 50, which would make the answer 50 instead of 51.
  let k = 0;
  for (let power = 1; power < n; power *= 2) {
    k += 1;
  }
  return k;
}

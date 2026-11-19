import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ceilLog2 } from './math.ts';

describe('ceilLog2', () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [1024, 10],
    [1025, 11],
    [2 ** 40, 40],
    // Math.log2(2^50 + 1) rounds to exactly 50.
    [2 ** 50 + 1, 51],
    [Number.MAX_SAFE_INTEGER, 53],
  ])('ceilLog2(%i) = %i', (n, expected) => {
    expect(ceilLog2(n)).toBe(expected);
  });

  it('is the smallest k with 2^k >= n', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: Number.MAX_SAFE_INTEGER }), (n) => {
        const k = ceilLog2(n);
        expect(2 ** k).toBeGreaterThanOrEqual(n);
        expect(2 ** (k - 1)).toBeLessThan(n);
      }),
    );
  });

  it.each([-1, 1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (n) => {
    expect(() => ceilLog2(n)).toThrow(
      new RangeError(`ceilLog2 expects a non-negative safe integer, got ${String(n)}`),
    );
  });
});

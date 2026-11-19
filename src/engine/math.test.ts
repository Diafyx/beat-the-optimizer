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
  ])('ceilLog2(%i) = %i', (n, expected) => {
    expect(ceilLog2(n)).toBe(expected);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (n) => {
    expect(() => ceilLog2(n)).toThrow(
      new RangeError(`ceilLog2 expects a non-negative integer, got ${String(n)}`),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { Random, hash } from './random.ts';

/** How often each of `min` to `max` comes up in `draws` draws. */
function histogram(random: Random, min: number, max: number, draws: number): number[] {
  const counts = Array.from({ length: max - min + 1 }, () => 0);
  for (let i = 0; i < draws; i += 1) {
    const value = random.int(min, max);
    counts[value - min] = (counts[value - min] ?? 0) + 1;
  }
  return counts;
}

describe('hash', () => {
  it('is 32-bit FNV-1a', () => {
    // The published FNV-1a offset basis and the hash of "a".
    expect(hash('')).toBe(0x811c9dc5);
    expect(hash('a')).toBe(0xe40c292c);
    expect(hash('orders.status')).toBe(1807867112);
  });
});

describe('Random', () => {
  it('gives the sfc32 numbers for a seed, on every engine', () => {
    // Checked against a separate implementation of sfc32 and splitmix32.
    const random = new Random(42);
    expect([random.uint32(), random.uint32(), random.uint32(), random.uint32()]).toEqual([
      3910993901, 1565048137, 3362278356, 3794119105,
    ]);
  });

  it('repeats itself for the same seed and name, and only then', () => {
    const draws = (random: Random) => Array.from({ length: 8 }, () => random.uint32());
    expect(draws(Random.for(1, 'a.b'))).toEqual(draws(Random.for(1, 'a.b')));
    expect(draws(Random.for(1, 'a.b'))).not.toEqual(draws(Random.for(2, 'a.b')));
    expect(draws(Random.for(1, 'a.b'))).not.toEqual(draws(Random.for(1, 'a.c')));
  });

  it('draws integers from min to max, both included, evenly', () => {
    const counts = histogram(new Random(7), 1, 6, 60_000);
    // 10,000 expected each; the standard deviation is about 91.
    for (const count of counts) {
      expect(Math.abs(count - 10_000)).toBeLessThan(400);
    }
    expect(histogram(new Random(7), -3, -3, 10)).toEqual([10]);
  });

  it('draws from a range that does not divide 2^32', () => {
    // A quarter of all 32-bit numbers is rejected for this range, and the
    // rest split evenly into its lower and upper half.
    const random = new Random(9);
    const max = 3 * 2 ** 30 - 1;
    const draws = Array.from({ length: 4_000 }, () => random.int(0, max));
    expect(draws.every((draw) => Number.isInteger(draw) && draw >= 0 && draw <= max)).toBe(true);
    const upper = draws.filter((draw) => draw > max / 2).length;
    expect(Math.abs(upper - 2_000)).toBeLessThan(150);
  });

  it.each([
    ['min above max', 2, 1],
    ['a fraction', 0, 1.5],
    ['a range over 2^32', 0, 2 ** 32],
    ['an unsafe integer', 0, 2 ** 53],
  ])('refuses %s', (_, min, max) => {
    expect(() => new Random(1).int(min, max)).toThrow(RangeError);
  });

  it('shuffles into a new array, the same way for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(new Random(42).shuffle(items)).toEqual([5, 8, 7, 3, 6, 4, 2, 1]);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('puts each item first about equally often', () => {
    const random = new Random(3);
    const first = Array.from({ length: 4 }, () => 0);
    for (let i = 0; i < 8_000; i += 1) {
      const [item = 0] = random.shuffle([0, 1, 2, 3]);
      first[item] = (first[item] ?? 0) + 1;
    }
    for (const count of first) {
      expect(Math.abs(count - 2_000)).toBeLessThan(200);
    }
  });
});

/**
 * A seeded pseudo-random generator for level data: sfc32, seeded through
 * splitmix32. Only 32-bit integer arithmetic, so every JavaScript engine and
 * Node version produces the same numbers from the same seed.
 */

const TWO_32 = 2 ** 32;

/** FNV-1a: a 32-bit hash of a string, to give each column its own stream. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

export class Random {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    let state = seed >>> 0;
    const splitmix = (): number => {
      state = (state + 0x9e3779b9) >>> 0;
      let z = state;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = splitmix();
    this.b = splitmix();
    this.c = splitmix();
    this.d = splitmix();
  }

  /** A generator for one named part of the data, independent of the others. */
  static for(seed: number, name: string): Random {
    return new Random((seed ^ hash(name)) >>> 0);
  }

  /** The next integer from 0 to 2^32 - 1: one sfc32 step, as in PractRand. */
  uint32(): number {
    const t = (this.a + this.b + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = (this.b ^ (this.b >>> 9)) >>> 0;
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = (((this.c << 21) | (this.c >>> 11)) + t) >>> 0;
    return t;
  }

  /** A uniformly random integer from `min` to `max`, both included. */
  int(min: number, max: number): number {
    const range = max - min + 1;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || range < 1 || range > TWO_32) {
      throw new RangeError(`Cannot draw an integer from ${String(min)} to ${String(max)}`);
    }
    // Rejection sampling: drop the top values that would make some results
    // more likely than others.
    const limit = TWO_32 - (TWO_32 % range);
    let x = this.uint32();
    while (x >= limit) {
      x = this.uint32();
    }
    return min + (x % range);
  }

  /**
   * `items` in random order: sorted by a random 53-bit key each. Keys repeat
   * so rarely that the stable sort's tie order does not matter.
   */
  shuffle<T>(items: readonly T[]): T[] {
    return items
      .map((item) => ({ item, key: this.uint32() * 2 ** 21 + (this.uint32() >>> 11) }))
      .sort((x, y) => x.key - y.key)
      .map(({ item }) => item);
  }
}

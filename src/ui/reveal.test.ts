import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExplainNode, Level } from '../engine/index.ts';
import { describeMiss, worstMiss } from './reveal.ts';

// True counts: authors 20 after its filter, books 20,000, the join 400.
const example = JSON.parse(readFileSync('tests/fixtures/example-level.json', 'utf8')) as Level;

const node = (
  nodeType: string,
  relation: string | null,
  estimatedRows: number,
  children: ExplainNode[] = [],
): ExplainNode => ({ nodeType, relation, index: null, estimatedRows, estimatedCost: 1, children });

const withExplain = (explain: ExplainNode): Level => ({
  ...example,
  optimizer: { ...example.optimizer, explain },
});

describe('worstMiss', () => {
  it('finds nothing when every estimate is within 3×', () => {
    // The example's EXPLAIN: authors 20 (true 20), the join 400 (true 400).
    expect(worstMiss(example)).toBeNull();
    const close = node('Hash Join', null, 134, [
      node('Seq Scan', 'books', 20_000),
      node('Hash', null, 7, [node('Seq Scan', 'authors', 7)]),
    ]);
    expect(worstMiss(withExplain(close))).toBeNull();
  });

  it('finds the furthest-off scan or join, either way', () => {
    const join = node('Hash Join', null, 40, [
      node('Seq Scan', 'books', 20_000),
      node('Hash', null, 2, [node('Seq Scan', 'authors', 2)]),
    ]);
    // The join is 10× too low, authors 10× too low: on a tie, the deeper one.
    expect(worstMiss(withExplain(join))).toEqual({ what: 'authors', expected: 2, actual: 20 });
    const high = node('Merge Join', null, 40_000, [
      node('Index Scan', 'books', 20_000),
      node('Sort', null, 20, [node('Seq Scan', 'authors', 20)]),
    ]);
    expect(worstMiss(withExplain(high))).toEqual({
      what: 'books and authors',
      expected: 40_000,
      actual: 400,
    });
  });

  it('leaves out the inner side of a nested loop, where estimates are per loop', () => {
    const loop = node('Nested Loop', null, 400, [
      node('Seq Scan', 'authors', 20),
      node('Index Scan', 'books', 1),
    ]);
    expect(worstMiss(withExplain(loop))).toBeNull();
  });

  it('counts an estimate of 0 as 1', () => {
    const zero = node('Seq Scan', 'authors', 0);
    expect(worstMiss(withExplain(zero))).toEqual({ what: 'authors', expected: 0, actual: 20 });
  });
});

describe('describeMiss', () => {
  it('says what the Optimizer expected, what it got, and how far off it was', () => {
    expect(describeMiss({ what: 'orders', expected: 10, actual: 10_000 })).toBe(
      'The Optimizer expected 10 rows from orders. It got 10,000: 1,000× more.',
    );
    expect(describeMiss({ what: 'orders', expected: 149, actual: 60_333 })).toBe(
      'The Optimizer expected 149 rows from orders. It got 60,333: 405× more.',
    );
    expect(describeMiss({ what: 'books and authors', expected: 40_000, actual: 1 })).toBe(
      'The Optimizer expected 40,000 rows from books and authors. It got 1: 40,000× fewer.',
    );
    expect(describeMiss({ what: 'authors', expected: 1, actual: 20 })).toBe(
      'The Optimizer expected 1 row from authors. It got 20: 20× more.',
    );
  });
});

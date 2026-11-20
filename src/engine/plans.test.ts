import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planCost } from './cost.ts';
import type { Level, Lock, Plan, Scan, Step, Table } from './level.ts';
import { allowedByLocks, bestPlan, enumeratePlans, joinOrder } from './plans.ts';

const example = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/example-level.json', import.meta.url), 'utf8'),
) as Level;

const seq = (table: string): Scan => ({ table, access: 'seq' });
const byIndex = (table: string, index: string): Scan => ({ table, access: 'index', index });
const plan = (first: Scan, ...steps: Step[]): Plan => ({ first, steps });
const hash = (scan: Scan): Step => ({ join: 'hash', scan });
const inl = (table: string, index: string): Step => ({ join: 'indexNestedLoop', table, index });

/** A table with one integer column per name and an index on each of `indexed`. */
const table = (name: string, columns: readonly string[], indexed: readonly string[]): Table => ({
  name,
  rows: 10,
  filter: null,
  storedOrder: null,
  columns: columns.map((column) => ({ name: column, type: 'integer', stats: null })),
  indexes: indexed.map((column) => ({ name: `${name}_${column}_idx`, column })),
});

/** a ← b ← c: b.a_id = a.id and c.b_id = b.id. Only the structure matters here. */
const chain: Level = {
  ...example,
  tables: [table('a', ['id'], []), table('b', ['id', 'a_id'], ['a_id']), table('c', ['b_id'], [])],
  joins: [
    { left: { table: 'a', column: 'id' }, right: { table: 'b', column: 'a_id' } },
    { left: { table: 'b', column: 'id' }, right: { table: 'c', column: 'b_id' } },
  ],
  orderBy: null,
};

const withLocks = (...locks: Lock[]): Level => ({ ...example, locks });

describe('enumeratePlans', () => {
  it('finds the 41 plans of the example level, each once', () => {
    const plans = enumeratePlans(example);
    expect(plans).toHaveLength(41);
    expect(new Set(plans.map((p) => JSON.stringify(p))).size).toBe(41);
    expect(plans[0]).toEqual(plan(seq('authors'), hash(seq('books'))));
  });

  it('offers an index nested loop only through an index on the join column', () => {
    const lookups = enumeratePlans(example).flatMap((p) =>
      p.steps.flatMap((step) => (step.join === 'indexNestedLoop' ? [step.index] : [])),
    );
    // books_pkey is on book_id, which no predicate joins on.
    expect(new Set(lookups)).toEqual(new Set(['books_author_id_idx', 'authors_pkey']));
  });

  it('joins each new table to an earlier one, so a and c are never adjacent at the start', () => {
    const orders = new Set(enumeratePlans(chain).map((p) => joinOrder(p).join('')));
    expect(orders).toEqual(new Set(['abc', 'bac', 'bca', 'cba']));
  });

  it('counts every access path and join method on three tables', () => {
    // a and c have 1 scan each, b has 2. Each later table has 3 methods × its
    // scans, plus an index nested loop where it has an index on its join column:
    // b does after a (b_a_id_idx is on a_id) but not after c (no index on b.id).
    // abc: 1 × (6 + 1) × 3, bac: 2 × 3 × 3, bca: 2 × 3 × 3, cba: 1 × 6 × 3.
    expect(enumeratePlans(chain)).toHaveLength(21 + 18 + 18 + 18);
  });

  it('gives a single-table level its scans', () => {
    const level = { ...example, tables: [table('t', ['id'], ['id'])], joins: [] };
    expect(enumeratePlans(level)).toEqual([plan(seq('t')), plan(byIndex('t', 't_id_idx'))]);
  });

  it('finds no plan when the predicates do not connect the tables', () => {
    expect(enumeratePlans({ ...example, joins: [] })).toEqual([]);
  });
});

describe('bestPlan', () => {
  it('finds the stored best plan of the example level', () => {
    const best = bestPlan(example);
    expect(best.plan).toEqual(example.costs.bestPlan);
    expect(best.cost).toEqual(planCost(example, example.costs.bestPlan));
    expect(best.cost.total).toBe(3080);
  });

  it('keeps the first plan in enumeration order on a tie', () => {
    // The authors_pkey index scan ties at 3,080 but comes after the seq scan.
    const tie = plan(byIndex('authors', 'authors_pkey'), inl('books', 'books_author_id_idx'));
    expect(planCost(example, tie).total).toBe(3080);
    expect(bestPlan(example).plan.first).toEqual(seq('authors'));
  });

  it('ignores the locks', () => {
    const locked = withLocks({ kind: 'joinMethod', method: 'hash' });
    expect(bestPlan(locked).plan).toEqual(example.costs.bestPlan);
  });

  it('throws when the level has no plan', () => {
    expect(() => bestPlan({ ...example, joins: [] })).toThrow(
      new Error('The level has no plan: its join predicates do not connect its tables'),
    );
  });
});

describe('allowedByLocks', () => {
  const best = example.costs.bestPlan;
  const booksFirst = plan(seq('books'), hash(seq('authors')));

  it('allows every plan when there are no locks', () => {
    expect(allowedByLocks(example, best)).toBe(true);
  });

  it.each<[string, Lock, Plan, boolean]>([
    ['the locked join order', { kind: 'joinOrder', tables: ['authors', 'books'] }, best, true],
    ['another join order', { kind: 'joinOrder', tables: ['authors', 'books'] }, booksFirst, false],
    ['a one-table join order lock', { kind: 'joinOrder', tables: ['books'] }, best, true],
    ['a join order lock on a missing table', { kind: 'joinOrder', tables: ['nope'] }, best, false],
    ['the locked join method', { kind: 'joinMethod', method: 'indexNestedLoop' }, best, true],
    ['another join method', { kind: 'joinMethod', method: 'hash' }, best, false],
    ['the locked seq scan', { kind: 'access', scan: seq('authors') }, best, true],
    [
      'an index scan where a seq scan is locked',
      { kind: 'access', scan: seq('authors') },
      plan(byIndex('authors', 'authors_pkey'), inl('books', 'books_author_id_idx')),
      false,
    ],
    [
      'a seq scan where an index scan is locked',
      { kind: 'access', scan: byIndex('authors', 'authors_pkey') },
      best,
      false,
    ],
    [
      'another index where an index scan is locked',
      { kind: 'access', scan: byIndex('books', 'books_pkey') },
      plan(seq('authors'), hash(byIndex('books', 'books_author_id_idx'))),
      false,
    ],
    [
      'the locked index scan on a joined table',
      { kind: 'access', scan: byIndex('books', 'books_pkey') },
      plan(seq('authors'), hash(byIndex('books', 'books_pkey'))),
      true,
    ],
    [
      'an index nested loop into a table with a locked scan',
      { kind: 'access', scan: seq('books') },
      best,
      true,
    ],
  ])('%s: %s', (_, lock, candidate, allowed) => {
    expect(allowedByLocks(withLocks(lock), candidate)).toBe(allowed);
  });

  it('checks the locked join order as a relative order on three tables', () => {
    const level = { ...chain, locks: [{ kind: 'joinOrder', tables: ['a', 'c'] } as const] };
    const allowed = enumeratePlans(level).filter((p) => allowedByLocks(level, p));
    expect(new Set(allowed.map((p) => joinOrder(p).join('')))).toEqual(new Set(['abc', 'bac']));
  });

  it('needs every join to use the locked join method', () => {
    const level = { ...chain, locks: [{ kind: 'joinMethod', method: 'hash' } as const] };
    const mixed = plan(seq('a'), hash(seq('b')), { join: 'merge', scan: seq('c') });
    expect(allowedByLocks(level, mixed)).toBe(false);
    expect(allowedByLocks(level, plan(seq('a'), hash(seq('b')), hash(seq('c'))))).toBe(true);
  });

  it('rejects a join order lock whose later table is missing', () => {
    const lock = { kind: 'joinOrder', tables: ['authors', 'nope'] } as const;
    expect(allowedByLocks(withLocks(lock), example.costs.bestPlan)).toBe(false);
  });

  it('needs every lock to allow the plan', () => {
    const level = withLocks(
      { kind: 'joinMethod', method: 'indexNestedLoop' },
      { kind: 'access', scan: byIndex('authors', 'authors_pkey') },
    );
    expect(allowedByLocks(level, best)).toBe(false);
  });
});

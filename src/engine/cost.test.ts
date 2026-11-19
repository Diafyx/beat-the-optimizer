import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planCost, type Operator, type SortReason } from './cost.ts';
import type { ColumnRef, Level, Plan, Scan, Step, Table } from './level.ts';

const example = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/example-level.json', import.meta.url), 'utf8'),
) as Level;

/** items[index], failing the test if it is missing. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item ${String(index)}`);
  }
  return item;
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

/** A copy of the example level, changed by `edit`. */
function exampleWith(edit: (level: Mutable<Level>) => void): Level {
  const level = structuredClone(example) as Mutable<Level>;
  edit(level);
  return level;
}

const seq = (table: string): Scan => ({ table, access: 'seq' });
const byIndex = (table: string, index: string): Scan => ({ table, access: 'index', index });
const plan = (first: Scan, ...steps: Step[]): Plan => ({ first, steps });
const hash = (scan: Scan): Step => ({ join: 'hash', scan });
const loop = (scan: Scan): Step => ({ join: 'nestedLoop', scan });
const merge = (scan: Scan): Step => ({ join: 'merge', scan });
const inl = (table: string, index: string): Step => ({ join: 'indexNestedLoop', table, index });
const sort = (reason: SortReason, column: ColumnRef, rows: number, cost: number): Operator => ({
  kind: 'sort',
  reason,
  column,
  rows,
  cost,
});

const authors = { table: 'authors', column: 'author_id' };
const booksAuthor = { table: 'books', column: 'author_id' };
const both = ['authors', 'books'];
const best = plan(seq('authors'), inl('books', 'books_author_id_idx'));

describe('planCost: the worked example in docs/cost-model.md', () => {
  it('seq scan of authors, index nested loop into books: 3,080', () => {
    expect(planCost(example, best)).toEqual({
      operators: [
        { kind: 'seqScan', table: 'authors', rows: 20, cost: 1000 },
        { kind: 'join', method: 'indexNestedLoop', tables: both, rows: 400, cost: 1680 },
        { kind: 'joinOutput', tables: both, rows: 400, cost: 400 },
      ],
      total: 3080,
    });
  });

  it('seq scans of both, hash join: 45,020', () => {
    expect(planCost(example, plan(seq('authors'), hash(seq('books'))))).toEqual({
      operators: [
        { kind: 'seqScan', table: 'authors', rows: 20, cost: 1000 },
        { kind: 'seqScan', table: 'books', rows: 20000, cost: 20000 },
        { kind: 'join', method: 'hash', tables: both, rows: 400, cost: 20020 },
        { kind: 'joinOutput', tables: both, rows: 400, cost: 400 },
        sort('orderBy', authors, 400, 3600),
      ],
      total: 45020,
    });
  });

  it('seq scan of authors, merge join with an index scan of books: 101,420', () => {
    const books = byIndex('books', 'books_author_id_idx');
    expect(planCost(example, plan(seq('authors'), merge(books)))).toEqual({
      operators: [
        { kind: 'seqScan', table: 'authors', rows: 20, cost: 1000 },
        {
          kind: 'indexScan',
          table: 'books',
          index: 'books_author_id_idx',
          inOrder: false,
          rows: 20000,
          cost: 80000,
        },
        { kind: 'join', method: 'merge', tables: both, rows: 400, cost: 20020 },
        { kind: 'joinOutput', tables: both, rows: 400, cost: 400 },
      ],
      total: 101420,
    });
  });

  it('seq scan of books, index nested loop into authors: 184,000', () => {
    const tables = ['books', 'authors'];
    expect(planCost(example, plan(seq('books'), inl('authors', 'authors_pkey')))).toEqual({
      operators: [
        { kind: 'seqScan', table: 'books', rows: 20000, cost: 20000 },
        { kind: 'join', method: 'indexNestedLoop', tables, rows: 400, cost: 160000 },
        { kind: 'joinOutput', tables, rows: 400, cost: 400 },
        sort('orderBy', authors, 400, 3600),
      ],
      total: 184000,
    });
  });

  it('an index scan of authors in stored order ties with the best plan', () => {
    const authorsPkey = byIndex('authors', 'authors_pkey');
    const cost = planCost(example, plan(authorsPkey, inl('books', 'books_author_id_idx')));
    expect(cost.operators[0]).toEqual({
      kind: 'indexScan',
      table: 'authors',
      index: 'authors_pkey',
      inOrder: true,
      rows: 20,
      cost: 1000,
    });
    expect(cost.total).toBe(3080);
  });

  it('matches the stored costs of the example level', () => {
    expect(planCost(example, example.costs.bestPlan).total).toBe(example.costs.best);
    expect(planCost(example, example.optimizer.plan).total).toBe(example.costs.optimizer);
  });
});

describe('planCost: operators and order', () => {
  it('scores a single-table plan as its scan, plus the ORDER BY sort if needed', () => {
    const level = exampleWith((l) => {
      l.tables = [at(l.tables, 1)];
      l.joins = [];
      l.orderBy = booksAuthor;
    });
    expect(planCost(level, plan(seq('books')))).toEqual({
      operators: [
        { kind: 'seqScan', table: 'books', rows: 20000, cost: 20000 },
        // ceilLog2(20000) = 15
        sort('orderBy', booksAuthor, 20000, 300000),
      ],
      total: 320000,
    });
  });

  it('charges a nested loop L × R and keeps the left order', () => {
    const cost = planCost(example, plan(seq('authors'), loop(seq('books'))));
    expect(cost.operators.slice(2)).toEqual([
      { kind: 'join', method: 'nestedLoop', tables: both, rows: 400, cost: 400000 },
      { kind: 'joinOutput', tables: both, rows: 400, cost: 400 },
    ]);
  });

  it('sorts the left input of a merge join that is out of order', () => {
    const cost = planCost(example, plan(seq('books'), merge(seq('authors'))));
    // The merge join returns books.author_id order, which equals authors.author_id,
    // so the ORDER BY needs no sort.
    expect(cost.operators).toEqual([
      { kind: 'seqScan', table: 'books', rows: 20000, cost: 20000 },
      { kind: 'seqScan', table: 'authors', rows: 20, cost: 1000 },
      sort('mergeLeft', booksAuthor, 20000, 300000),
      { kind: 'join', method: 'merge', tables: ['books', 'authors'], rows: 400, cost: 20020 },
      { kind: 'joinOutput', tables: ['books', 'authors'], rows: 400, cost: 400 },
    ]);
    expect(cost.total).toBe(341420);
  });

  it('sorts the right input of a merge join that is out of order', () => {
    const cost = planCost(example, plan(seq('authors'), merge(seq('books'))));
    expect(cost.operators[2]).toEqual(sort('mergeRight', booksAuthor, 20000, 300000));
  });

  it('needs no ORDER BY sort when the query has no ORDER BY', () => {
    const level = exampleWith((l) => {
      l.orderBy = null;
    });
    expect(planCost(level, plan(seq('authors'), hash(seq('books')))).total).toBe(41420);
  });

  it('uses the matched rows of the index scanned', () => {
    const level = exampleWith((l) => {
      at(at(l.cardinalities.scans, 1).indexes, 0).matched = 1;
    });
    const [scan] = planCost(level, plan(byIndex('books', 'books_author_id_idx'))).operators;
    expect(scan).toMatchObject({ index: 'books_author_id_idx', cost: 80000 });
  });

  it('gives a seq scan of a table with no stored order no order', () => {
    const level = exampleWith((l) => {
      at(l.tables, 0).storedOrder = null;
    });
    expect(planCost(level, best).operators.at(-1)).toEqual(sort('orderBy', authors, 400, 3600));
  });
});

/** A table with integer columns and one index, on `indexed`. */
function table(
  name: string,
  rows: number,
  storedOrder: string | null,
  columns: readonly string[],
  indexed: string,
): Mutable<Table> {
  return {
    name,
    rows,
    filter: null,
    storedOrder,
    columns: columns.map((column) => ({ name: column, type: 'integer', stats: null })),
    indexes: [{ name: `${name}_${indexed}_idx`, column: indexed }],
  };
}

/**
 * a(id) ← b(a_id, id) ← c(b_id): a has 10 matching rows, each with 10 rows in
 * b, and half of b's rows have 5 rows in c.
 */
const chain: Level = exampleWith((l) => {
  l.tables = [
    { ...table('a', 100, 'id', ['id', 'flag'], 'id'), filter: 'flag' },
    table('b', 1000, 'a_id', ['id', 'a_id'], 'a_id'),
    table('c', 5000, null, ['b_id'], 'b_id'),
  ];
  l.joins = [
    { left: { table: 'a', column: 'id' }, right: { table: 'b', column: 'a_id' } },
    { left: { table: 'b', column: 'id' }, right: { table: 'c', column: 'b_id' } },
  ];
  l.orderBy = { table: 'a', column: 'id' };
  l.cardinalities = {
    scans: [
      { table: 'a', filtered: 10, indexes: [{ index: 'a_id_idx', matched: 100 }] },
      { table: 'b', filtered: 1000, indexes: [{ index: 'b_a_id_idx', matched: 1000 }] },
      { table: 'c', filtered: 5000, indexes: [{ index: 'c_b_id_idx', matched: 5000 }] },
    ],
    joins: [
      { tables: ['a', 'b'], rows: 100 },
      { tables: ['b', 'c'], rows: 5000 },
      { tables: ['a', 'b', 'c'], rows: 500 },
    ],
    lookups: [
      { outer: ['a'], index: 'b_a_id_idx', fetched: 100 },
      { outer: ['b'], index: 'c_b_id_idx', fetched: 5000 },
      // Decoys listed first: the same outer tables with another index, and
      // another set of outer tables of the same size.
      { outer: ['a', 'b'], index: 'a_id_idx', fetched: 7 },
      { outer: ['a', 'c'], index: 'c_b_id_idx', fetched: 9 },
      { outer: ['b', 'a'], index: 'c_b_id_idx', fetched: 500 },
    ],
  };
});

describe('planCost: three tables', () => {
  it('looks up the second index nested loop by the outer tables as a set', () => {
    const cost = planCost(chain, plan(seq('a'), inl('b', 'b_a_id_idx'), inl('c', 'c_b_id_idx')));
    const joins = cost.operators.filter(({ kind }) => kind === 'join');
    expect(joins.map((join) => join.cost)).toEqual([4 * (10 + 100), 4 * (100 + 500)]);
    expect(cost.total).toBe(100 + 440 + 100 + 2400 + 500);
  });

  it('counts order on one side of a join predicate as order on the other', () => {
    // b is stored in a_id order. After b ⨝ a on b.a_id = a.id, that is also
    // a.id order, and the nested loops keep it, so ORDER BY a.id needs no sort.
    const cost = planCost(chain, plan(seq('b'), loop(seq('a')), loop(seq('c'))));
    expect(cost.operators.some(({ kind }) => kind === 'sort')).toBe(false);
    expect(cost.total).toBe(1000 + 100 + 10000 + 100 + 5000 + 500000 + 500);
  });

  it('loses the order after a hash join', () => {
    const cost = planCost(chain, plan(seq('b'), loop(seq('a')), hash(seq('c'))));
    // ceilLog2(500) = 9
    expect(cost.operators.at(-1)).toEqual(sort('orderBy', { table: 'a', column: 'id' }, 500, 4500));
  });
});

describe('planCost: plans it cannot score', () => {
  it.each<[string, Level, Plan, string]>([
    ['an unknown table', example, plan(seq('publishers')), 'The level has no table publishers'],
    [
      'an unknown index',
      example,
      plan(byIndex('authors', 'books_pkey')),
      'The level has no index books_pkey on authors',
    ],
    [
      'a missing scan cardinality',
      exampleWith((l) => {
        l.cardinalities.scans = l.cardinalities.scans.slice(1);
      }),
      best,
      'The level has no scan cardinality for authors',
    ],
    [
      'a missing index cardinality',
      exampleWith((l) => {
        at(l.cardinalities.scans, 0).indexes = [];
      }),
      plan(byIndex('authors', 'authors_pkey')),
      'The level has no index cardinality for authors_pkey',
    ],
    [
      'a missing join cardinality',
      exampleWith((l) => {
        l.cardinalities.joins = [];
      }),
      best,
      'The level has no join cardinality for authors, books',
    ],
    [
      'a missing lookup cardinality',
      exampleWith((l) => {
        l.cardinalities.lookups = l.cardinalities.lookups.slice(1);
      }),
      best,
      'The level has no lookup cardinality for books_author_id_idx',
    ],
    [
      'a missing join predicate',
      exampleWith((l) => {
        l.joins = [];
      }),
      best,
      'The level has no join predicate between authors and books',
    ],
    [
      'a missing join predicate for the third table',
      { ...chain, joins: chain.joins.slice(0, 1) },
      plan(seq('a'), hash(seq('b')), hash(seq('c'))),
      'The level has no join predicate between a, b and c',
    ],
    [
      'a table joined twice',
      example,
      plan(seq('authors'), hash(seq('authors'))),
      'The plan joins authors twice',
    ],
    [
      'an index nested loop through an index off the join column',
      example,
      plan(seq('authors'), inl('books', 'books_pkey')),
      'The index books_pkey is on books.book_id, not on the join column books.author_id',
    ],
  ])('throws on %s', (_, level, badPlan, message) => {
    expect(() => planCost(level, badPlan)).toThrow(new Error(message));
  });

  it('throws when the cost is above 2^53 - 1', () => {
    const level = exampleWith((l) => {
      at(l.cardinalities.scans, 0).filtered = 2 ** 30;
      at(l.cardinalities.scans, 1).filtered = 2 ** 30;
    });
    expect(() => planCost(level, plan(seq('authors'), loop(seq('books'))))).toThrow(
      new RangeError('The plan costs more than 2^53 - 1'),
    );
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Level, Plan, Table } from './level.ts';
import { bestPlan } from './plans.ts';
import { planCost } from './cost.ts';
import { connectedSets, validateLevel, type LevelError } from './validate.ts';

const example = JSON.parse(
  readFileSync(new URL('../../tests/fixtures/example-level.json', import.meta.url), 'utf8'),
) as Level;

type Path = readonly (string | number)[];

/** A copy of `level` with the value at `path` replaced. */
function variant(level: Level, path: Path, value: unknown): Level {
  const copy = structuredClone(level) as unknown as Record<string | number, unknown>;
  let node = copy;
  for (const step of path.slice(0, -1)) node = node[step] as Record<string | number, unknown>;
  node[path[path.length - 1] ?? ''] = value;
  return copy as unknown as Level;
}

/** A table with one integer column per name and an index on each of `indexed`. */
const table = (name: string, columns: readonly string[], indexed: readonly string[]): Table => ({
  name,
  rows: 100,
  filter: null,
  storedOrder: null,
  columns: columns.map((column) => ({ name: column, type: 'integer', stats: null })),
  indexes: indexed.map((column) => ({ name: `${name}_${column}_idx`, column })),
});

const allHash: Plan = {
  first: { table: 'a', access: 'seq' },
  steps: [
    { join: 'hash', scan: { table: 'b', access: 'seq' } },
    { join: 'hash', scan: { table: 'c', access: 'seq' } },
  ],
};

const scanNode = (relation: string) => ({
  nodeType: 'Seq Scan',
  relation,
  index: null,
  estimatedRows: 1,
  estimatedCost: 1,
  children: [],
});

/** a ← b ← c: b.a_id = a.id and c.b_id = b.id, with every cardinality. */
const chainWithoutCosts: Level = {
  ...example,
  tables: [
    table('a', ['id'], ['id']),
    table('b', ['id', 'a_id'], ['id', 'a_id']),
    table('c', ['b_id'], ['b_id']),
  ],
  joins: [
    { left: { table: 'a', column: 'id' }, right: { table: 'b', column: 'a_id' } },
    { left: { table: 'b', column: 'id' }, right: { table: 'c', column: 'b_id' } },
  ],
  orderBy: null,
  cardinalities: {
    scans: [
      { table: 'a', filtered: 10, indexes: [{ index: 'a_id_idx', matched: 100 }] },
      {
        table: 'b',
        filtered: 100,
        indexes: [
          { index: 'b_id_idx', matched: 100 },
          { index: 'b_a_id_idx', matched: 100 },
        ],
      },
      { table: 'c', filtered: 100, indexes: [{ index: 'c_b_id_idx', matched: 100 }] },
    ],
    joins: [
      { tables: ['a', 'b'], rows: 10 },
      { tables: ['c', 'b'], rows: 100 },
      { tables: ['a', 'b', 'c'], rows: 10 },
    ],
    lookups: [
      { outer: ['a'], index: 'b_a_id_idx', fetched: 10 },
      { outer: ['b'], index: 'a_id_idx', fetched: 100 },
      { outer: ['b'], index: 'c_b_id_idx', fetched: 100 },
      { outer: ['c'], index: 'b_id_idx', fetched: 100 },
      { outer: ['b', 'a'], index: 'c_b_id_idx', fetched: 10 },
      { outer: ['b', 'c'], index: 'a_id_idx', fetched: 100 },
    ],
  },
  optimizer: {
    ...example.optimizer,
    plan: allHash,
    explain: {
      ...scanNode('a'),
      nodeType: 'Hash Join',
      relation: null,
      children: [scanNode('a'), scanNode('b'), scanNode('c')],
    },
  },
};

const chain: Level = {
  ...chainWithoutCosts,
  costs: {
    best: bestPlan(chainWithoutCosts).cost.total,
    optimizer: planCost(chainWithoutCosts, allHash).total,
    bestPlan: bestPlan(chainWithoutCosts).plan,
  },
};

const books = ['tables', 1];
const bestSteps = ['costs', 'bestPlan', 'steps'];
const optimizerSteps = ['optimizer', 'plan', 'steps'];
const error = (rule: number, message: string): LevelError => ({ rule, message });

describe('validateLevel', () => {
  it.each<[string, Level]>([
    ['the example level', example],
    ['a three-table chain', chain],
    [
      'a level whose locks allow its optimizer plan',
      variant(
        example,
        ['locks'],
        [
          { kind: 'joinOrder', tables: ['authors', 'books'] },
          { kind: 'joinMethod', method: 'indexNestedLoop' },
          { kind: 'access', scan: { table: 'authors', access: 'seq' } },
        ],
      ),
    ],
    [
      'a level whose explain names a table twice',
      variant(example, ['optimizer', 'explain', 'children', 2], scanNode('books')),
    ],
    [
      'a three-table chain whose predicates are listed backwards',
      variant(
        chain,
        ['joins'],
        [
          { left: { table: 'c', column: 'b_id' }, right: { table: 'b', column: 'id' } },
          { left: { table: 'b', column: 'a_id' }, right: { table: 'a', column: 'id' } },
        ],
      ),
    ],
    [
      'a level with an index scan lock',
      variant(
        example,
        ['locks'],
        [
          {
            kind: 'access',
            scan: { table: 'books', access: 'index', index: 'books_author_id_idx' },
          },
        ],
      ),
    ],
  ])('accepts %s', (_, level) => {
    expect(validateLevel(level)).toEqual([]);
  });

  it.each<[string, Level, LevelError[]]>([
    // Rule 1: names are unique.
    [
      'a repeated table',
      variant(example, ['tables', 2], example.tables[1]),
      [
        error(1, 'The table books is defined more than once'),
        error(1, 'The index books_pkey is defined more than once'),
        error(1, 'The index books_author_id_idx is defined more than once'),
      ],
    ],
    [
      'a repeated column',
      variant(example, [...books, 'columns', 2, 'name'], 'author_id'),
      [error(1, 'The column books.author_id is defined more than once')],
    ],
    [
      'a repeated index',
      variant(example, [...books, 'indexes', 0, 'name'], 'authors_pkey'),
      [error(1, 'The index authors_pkey is defined more than once')],
    ],
    // Rule 2: references resolve.
    [
      'a stored order on a missing column',
      variant(example, [...books, 'storedOrder'], 'isbn'),
      [error(2, 'The stored order of books names books.isbn, which is not a column')],
    ],
    [
      'an index on a missing column',
      variant(example, [...books, 'indexes', 0, 'column'], 'isbn'),
      [error(2, 'The index books_pkey names books.isbn, which is not a column')],
    ],
    [
      'a join predicate on a missing column',
      variant(example, ['joins', 0, 'left', 'column'], 'id'),
      [
        error(
          2,
          'The join predicate authors.id = books.author_id names authors.id, which is not a column',
        ),
      ],
    ],
    [
      'a join predicate on a missing table',
      variant(example, ['joins', 0, 'right', 'table'], 'nope'),
      [
        error(
          2,
          'The join predicate authors.author_id = nope.author_id names nope.author_id, which is not a column',
        ),
      ],
    ],
    [
      'an ORDER BY on a missing column',
      variant(example, ['orderBy', 'column'], 'title'),
      [error(2, 'ORDER BY names authors.title, which is not a column')],
    ],
    [
      'a join order lock on a missing table',
      variant(example, ['locks'], [{ kind: 'joinOrder', tables: ['authors', 'nope'] }]),
      [error(2, 'A join order lock names nope, which is not a table')],
    ],
    [
      'an access lock on a missing table',
      variant(example, ['locks'], [{ kind: 'access', scan: { table: 'nope', access: 'seq' } }]),
      [error(2, 'An access lock scans nope, which is not a table')],
    ],
    [
      "an access lock on another table's index",
      variant(
        example,
        ['locks'],
        [{ kind: 'access', scan: { table: 'authors', access: 'index', index: 'books_pkey' } }],
      ),
      [
        error(
          2,
          'An access lock scans authors through books_pkey, which is not an index on authors',
        ),
      ],
    ],
    // Rule 3: the predicates form a tree.
    [
      'a predicate that joins a table to itself',
      variant(chain, ['joins', 1, 'right'], { table: 'b', column: 'a_id' }),
      [
        error(3, 'The join predicate b.id = b.a_id joins a table to itself'),
        error(3, 'The join predicates do not connect every table'),
      ],
    ],
    [
      'too many predicates',
      variant(example, ['joins', 1], example.joins[0]),
      [
        error(
          3,
          'The level has 2 tables and 2 join predicates; a tree has one fewer predicate than tables',
        ),
      ],
    ],
    [
      'predicates that do not connect the tables',
      variant(chain, ['joins', 1], {
        left: { table: 'a', column: 'id' },
        right: { table: 'b', column: 'id' },
      }),
      [error(3, 'The join predicates do not connect every table')],
    ],
    // Rule 4: cardinalities are complete.
    [
      'a missing scan',
      variant(example, ['cardinalities', 'scans'], example.cardinalities.scans.slice(0, 1)),
      [
        error(4, 'cardinalities.scans is missing books'),
        error(4, 'cardinalities.scans is missing books index books_pkey'),
        error(4, 'cardinalities.scans is missing books index books_author_id_idx'),
      ],
    ],
    [
      'a missing index of a scan',
      variant(
        example,
        ['cardinalities', 'scans', 1, 'indexes'],
        [{ index: 'books_pkey', matched: 1 }],
      ),
      [error(4, 'cardinalities.scans is missing books index books_author_id_idx')],
    ],
    [
      'a missing join',
      variant(chain, ['cardinalities', 'joins', 2], { tables: ['a', 'c'], rows: 1 }),
      [
        error(4, 'cardinalities.joins is missing a, b, c'),
        error(4, 'cardinalities.joins has an unexpected entry a, c'),
      ],
    ],
    [
      'a missing lookup',
      variant(chain, ['cardinalities', 'lookups', 5, 'outer'], ['a', 'b']),
      [
        error(4, 'cardinalities.lookups is missing a_id_idx after b, c'),
        error(4, 'cardinalities.lookups has an unexpected entry a_id_idx after a, b'),
      ],
    ],
    [
      'a repeated lookup',
      variant(example, ['cardinalities', 'lookups', 2], example.cardinalities.lookups[0]),
      [error(4, 'cardinalities.lookups lists books_author_id_idx after authors more than once')],
    ],
    // Rule 5: plans are valid.
    [
      'a plan that joins a table twice',
      variant(example, [...bestSteps, 0], {
        join: 'hash',
        scan: { table: 'authors', access: 'seq' },
      }),
      [
        error(5, 'costs.bestPlan joins authors twice'),
        error(5, 'costs.bestPlan does not read books'),
      ],
    ],
    [
      'a plan that joins without a predicate',
      variant(chain, ['optimizer', 'plan'], { ...allHash, steps: [...allHash.steps].reverse() }),
      [error(5, 'optimizer.plan joins c without a join predicate to a')],
    ],
    [
      'an index nested loop off the join column',
      variant(example, [...optimizerSteps, 0, 'index'], 'books_pkey'),
      [
        error(
          5,
          'optimizer.plan looks up books through books_pkey, which is on books.book_id, not on the join column books.author_id',
        ),
        error(8, 'optimizer.plan uses the index books_pkey, but optimizer.explain does not'),
        error(
          8,
          'optimizer.explain uses the index books_author_id_idx, but optimizer.plan does not',
        ),
      ],
    ],
    [
      'a plan step with no predicate to the two tables before it',
      variant(chain, ['joins', 1], {
        left: { table: 'a', column: 'id' },
        right: { table: 'b', column: 'id' },
      }),
      [
        error(5, 'optimizer.plan joins c without a join predicate to a, b'),
        error(5, 'costs.bestPlan joins c without a join predicate to a, b'),
      ],
    ],
    [
      'an index nested loop into a missing table',
      variant(example, [...bestSteps, 0], { join: 'indexNestedLoop', table: 'nope', index: 'x' }),
      [
        error(5, 'costs.bestPlan joins nope without a join predicate to authors'),
        error(5, 'costs.bestPlan looks up nope through x, which is not an index on nope'),
        error(5, 'costs.bestPlan does not read books'),
      ],
    ],
    [
      'an index nested loop through a missing index',
      variant(example, [...bestSteps, 0, 'index'], 'nope'),
      [error(5, 'costs.bestPlan looks up books through nope, which is not an index on books')],
    ],
    [
      'a scan of a missing table',
      variant(example, ['costs', 'bestPlan', 'first', 'table'], 'nope'),
      [
        error(5, 'costs.bestPlan scans nope, which is not a table'),
        error(5, 'costs.bestPlan joins books without a join predicate to nope'),
        error(5, 'costs.bestPlan does not read authors'),
      ],
    ],
    [
      "a scan through another table's index",
      variant(example, [...bestSteps, 0], {
        join: 'hash',
        scan: { table: 'books', access: 'index', index: 'authors_pkey' },
      }),
      [error(5, 'costs.bestPlan scans books through authors_pkey, which is not an index on books')],
    ],
    // Rule 6: stored costs match the engine.
    [
      'a wrong best cost',
      variant(example, ['costs', 'best'], 3000),
      [
        error(6, 'costs.best is 3000, but the best plan costs 3080'),
        error(6, 'costs.bestPlan costs 3080, not costs.best'),
      ],
    ],
    [
      'a stored best plan that is not the best',
      variant(example, ['costs', 'bestPlan'], {
        first: { table: 'authors', access: 'seq' },
        steps: [{ join: 'hash', scan: { table: 'books', access: 'seq' } }],
      }),
      [error(6, 'costs.bestPlan costs 45020, not costs.best')],
    ],
    [
      'a wrong optimizer cost',
      variant(example, ['costs', 'optimizer'], 5000),
      [error(6, 'costs.optimizer is 5000, but optimizer.plan costs 3080')],
    ],
    [
      'a level whose plans cost more than 2^53 - 1',
      variant(example, [...books, 'rows'], Number.MAX_SAFE_INTEGER),
      [error(6, 'The plan costs more than 2^53 - 1')],
    ],
    // Rule 7: the player can match PostgreSQL.
    [
      'a best cost above the optimizer cost',
      variant(variant(example, ['costs', 'best'], 4000), ['costs', 'optimizer'], 3999),
      [
        error(6, 'costs.best is 4000, but the best plan costs 3080'),
        error(6, 'costs.bestPlan costs 3080, not costs.best'),
        error(6, 'costs.optimizer is 3999, but optimizer.plan costs 3080'),
        error(7, 'costs.best (4000) is above costs.optimizer (3999)'),
      ],
    ],
    [
      'locks that rule out the optimizer plan',
      variant(example, ['locks'], [{ kind: 'joinMethod', method: 'hash' }]),
      [error(7, 'The locks do not allow optimizer.plan, so the player cannot match it')],
    ],
    // Rule 8: explain matches the optimizer plan.
    [
      'an explain on another table',
      variant(example, ['optimizer', 'explain', 'children', 0, 'relation'], 'readers'),
      [
        error(8, 'optimizer.plan uses the table authors, but optimizer.explain does not'),
        error(8, 'optimizer.explain uses the table readers, but optimizer.plan does not'),
      ],
    ],
    [
      'an explain without the index of a joined index scan',
      variant(example, [...optimizerSteps, 0], {
        join: 'hash',
        scan: { table: 'books', access: 'index', index: 'books_pkey' },
      }),
      [
        error(8, 'optimizer.plan uses the index books_pkey, but optimizer.explain does not'),
        error(
          8,
          'optimizer.explain uses the index books_author_id_idx, but optimizer.plan does not',
        ),
      ],
    ],
  ])('rejects %s', (_, level, errors) => {
    // Only the rules under test: a broken level often breaks later rules too.
    const rules = new Set(errors.map(({ rule }) => rule));
    expect(validateLevel(level).filter(({ rule }) => rules.has(rule))).toEqual(errors);
  });

  it('checks the costs only when rules 1 to 5 pass', () => {
    const level = variant(example, ['costs', 'best'], 3000);
    const broken = variant(
      level,
      ['cardinalities', 'lookups', 2],
      example.cardinalities.lookups[0],
    );
    expect(validateLevel(level).map(({ rule }) => rule)).toEqual([6, 6]);
    expect(validateLevel(broken).map(({ rule }) => rule)).toEqual([4]);
  });
});

describe('connectedSets', () => {
  it('lists every connected set of tables, without the empty set', () => {
    const sets = connectedSets(chain).map((set) => set.join(' '));
    expect(sets).toEqual(['a', 'b', 'a b', 'c', 'b c', 'a b c']);
  });
});

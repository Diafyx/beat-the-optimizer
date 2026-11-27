import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Cardinalities, Level } from '../src/engine/level.ts';
import { validateLevel } from '../src/engine/validate.ts';
import { measure, type Query } from './counts.ts';

const example = JSON.parse(
  readFileSync(new URL('../tests/fixtures/example-level.json', import.meta.url), 'utf8'),
) as Level;

/** Runs `measure` with each new query counting as its position, from 1. */
function record(query: Query): { sql: string[]; cardinalities: Cardinalities } {
  const sql: string[] = [];
  return { sql, cardinalities: measure(query, (text) => sql.push(text)) };
}

/** Each cardinality on one line: what it counts, then the count. */
const lines = ({ scans, joins, lookups }: Cardinalities): string[] => [
  ...scans.flatMap(({ table, filtered, indexes }) => [
    `${table}: ${String(filtered)}`,
    ...indexes.map(({ index, matched }) => `${index}: ${String(matched)}`),
  ]),
  ...joins.map(({ tables, rows }) => `${tables.join(', ')}: ${String(rows)}`),
  ...lookups.map(
    ({ outer, index, fetched }) => `${index} after ${outer.join(', ')}: ${String(fetched)}`,
  ),
];

/** Rule 4's errors for `query`'s tables and joins with `cardinalities`. */
const rule4 = (query: Query, cardinalities: Cardinalities) =>
  validateLevel({
    ...example,
    tables: query.tables.map(({ name, indexes }) => ({
      name,
      rows: 100,
      filter: null,
      storedOrder: null,
      columns: indexes.map(({ column }) => ({ name: column, type: 'integer', stats: null })),
      indexes,
    })),
    joins: query.joins,
    cardinalities,
  }).filter(({ rule }) => rule === 4);

const one: Query = {
  tables: [
    {
      name: 'orders',
      filters: [
        { column: 'amount', op: '>=', value: 50 },
        { column: 'status', op: 'in', values: ['paid', "o'k"] },
      ],
      indexes: [
        { name: 'orders_amount_idx', column: 'amount' },
        { name: 'orders_pkey', column: 'order_id' },
      ],
    },
  ],
  joins: [],
};

const two: Query = {
  tables: example.tables.map(({ name, indexes }) => ({
    name,
    filters: name === 'authors' ? [{ column: 'country', op: '=', value: 'NZ' }] : [],
    indexes,
  })),
  joins: example.joins,
};

/** a ← b ← c: b.a_id = a.id and c.b_id = b.id, with filters on a and c. */
const three: Query = {
  tables: [
    {
      name: 'a',
      filters: [{ column: 'id', op: '<', value: 10 }],
      indexes: [{ name: 'a_id_idx', column: 'id' }],
    },
    {
      name: 'b',
      filters: [],
      indexes: [
        { name: 'b_id_idx', column: 'id' },
        { name: 'b_a_id_idx', column: 'a_id' },
      ],
    },
    {
      name: 'c',
      filters: [{ column: 'day', op: '>', value: '2024-06-30' }],
      indexes: [{ name: 'c_b_id_idx', column: 'b_id' }],
    },
  ],
  joins: [
    { left: { table: 'a', column: 'id' }, right: { table: 'b', column: 'a_id' } },
    { left: { table: 'b', column: 'id' }, right: { table: 'c', column: 'b_id' } },
  ],
};

describe('measure', () => {
  it('counts one table: its filters, and each index on the filters on its column', () => {
    const { sql, cardinalities } = record(one);
    expect(sql).toEqual([
      `SELECT count(*) FROM "orders" WHERE "orders"."amount" >= 50 AND "orders"."status" IN ('paid', 'o''k')`,
      'SELECT count(*) FROM "orders" WHERE "orders"."amount" >= 50',
      'SELECT count(*) FROM "orders"',
    ]);
    expect(cardinalities.joins).toEqual([]);
    expect(lines(cardinalities)).toEqual(['orders: 1', 'orders_amount_idx: 2', 'orders_pkey: 3']);
  });

  it('counts an index on a column filtered through an expression as matching every row', () => {
    const { sql, cardinalities } = record({
      tables: [
        {
          name: 'customers',
          filters: [
            { column: 'country', op: '=', value: 'is', expression: { kind: 'lower' } },
            { column: 'age', op: 'in', values: [60, 80], expression: { kind: 'times', by: 2 } },
          ],
          indexes: [
            { name: 'customers_country_idx', column: 'country' },
            { name: 'customers_age_idx', column: 'age' },
          ],
        },
      ],
      joins: [],
    });
    expect(sql).toEqual([
      `SELECT count(*) FROM "customers" WHERE lower("customers"."country") = 'is' AND "customers"."age" * 2 IN (60, 80)`,
      'SELECT count(*) FROM "customers"',
    ]);
    expect(lines(cardinalities)).toEqual([
      'customers: 1',
      'customers_country_idx: 2',
      'customers_age_idx: 2',
    ]);
  });

  it("counts the example level's two tables, running each distinct query once", () => {
    const { sql, cardinalities } = record(two);
    expect(sql).toEqual([
      `SELECT count(*) FROM "authors" WHERE "authors"."country" = 'NZ'`,
      'SELECT count(*) FROM "authors"',
      'SELECT count(*) FROM "books"',
      `SELECT count(*) FROM "authors", "books" WHERE "authors"."author_id" = "books"."author_id" AND "authors"."country" = 'NZ'`,
      'SELECT count(*) FROM "books", "authors" WHERE "books"."author_id" = "authors"."author_id"',
    ]);
    expect(lines(cardinalities)).toEqual([
      'authors: 1',
      'authors_pkey: 2',
      'books: 3',
      'books_pkey: 3',
      'books_author_id_idx: 3',
      'authors, books: 4',
      'books_author_id_idx after authors: 4',
      'authors_pkey after books: 5',
    ]);
  });

  it("counts three tables; a lookup leaves out the inner table's filters", () => {
    const { sql, cardinalities } = record(three);
    expect(sql).toEqual([
      'SELECT count(*) FROM "a" WHERE "a"."id" < 10',
      'SELECT count(*) FROM "b"',
      `SELECT count(*) FROM "c" WHERE "c"."day" > '2024-06-30'`,
      'SELECT count(*) FROM "c"',
      'SELECT count(*) FROM "a", "b" WHERE "a"."id" = "b"."a_id" AND "a"."id" < 10',
      `SELECT count(*) FROM "b", "c" WHERE "b"."id" = "c"."b_id" AND "c"."day" > '2024-06-30'`,
      `SELECT count(*) FROM "a", "b", "c" WHERE "a"."id" = "b"."a_id" AND "b"."id" = "c"."b_id" AND "a"."id" < 10 AND "c"."day" > '2024-06-30'`,
      'SELECT count(*) FROM "b", "a" WHERE "b"."a_id" = "a"."id"',
      'SELECT count(*) FROM "b", "c" WHERE "b"."id" = "c"."b_id"',
      'SELECT count(*) FROM "a", "b", "c" WHERE "a"."id" = "b"."a_id" AND "b"."id" = "c"."b_id" AND "a"."id" < 10',
      `SELECT count(*) FROM "c", "b" WHERE "c"."b_id" = "b"."id" AND "c"."day" > '2024-06-30'`,
      `SELECT count(*) FROM "b", "c", "a" WHERE "b"."id" = "c"."b_id" AND "b"."a_id" = "a"."id" AND "c"."day" > '2024-06-30'`,
    ]);
    expect(lines(cardinalities)).toEqual([
      'a: 1',
      'a_id_idx: 1',
      'b: 2',
      'b_id_idx: 2',
      'b_a_id_idx: 2',
      'c: 3',
      'c_b_id_idx: 4',
      'a, b: 5',
      'b, c: 6',
      'a, b, c: 7',
      'b_a_id_idx after a: 5',
      'a_id_idx after b: 8',
      'c_b_id_idx after b: 9',
      'c_b_id_idx after a, b: 10',
      'b_id_idx after c: 11',
      'a_id_idx after b, c: 12',
    ]);
  });

  it.each([
    ['one table', one],
    ['two tables', two],
    ['three tables', three],
  ])('measures every cardinality rule 4 requires, for %s', (_, query) => {
    expect(rule4(query, record(query).cardinalities)).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN, 2 ** 53])('rejects a count of %s', (rows) => {
    expect(() => measure(one, () => rows)).toThrow(
      `SELECT count(*) FROM "orders" WHERE "orders"."amount" >= 50 AND "orders"."status" IN ('paid', 'o''k') returned ${String(rows)}, which is not a row count`,
    );
  });
});

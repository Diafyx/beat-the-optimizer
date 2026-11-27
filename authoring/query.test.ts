import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { at } from './generate.ts';
import { levelSql, query, tableFilter } from './query.ts';
import { parseSpec, type Spec } from './spec.ts';

const example = parseSpec(
  readFileSync(new URL('fixtures/example-spec.yaml', import.meta.url), 'utf8'),
);
const [customers, orders] = [at(example.tables, 0), at(example.tables, 1)];

/** Only customers, with no ORDER BY. */
const one: Spec = {
  ...example,
  tables: [customers],
  level: {
    ...example.level,
    select: [{ table: 'customers', column: 'name' }],
    filters: [{ table: 'customers', column: 'country', op: 'in', values: ['IS', "o'k"] }],
    joins: [],
    orderBy: null,
  },
};

/** items, customers and orders, listed so that the second table does not join the first. */
const three: Spec = {
  ...example,
  tables: [
    {
      name: 'items',
      rows: 10,
      order: 'shuffled',
      columns: [{ name: 'order_id', type: 'bigint', values: { kind: 'sequence' } }],
      indexes: [],
    },
    customers,
    orders,
  ],
  level: {
    ...example.level,
    filters: [],
    joins: [
      ...example.level.joins,
      {
        left: { table: 'orders', column: 'order_id' },
        right: { table: 'items', column: 'order_id' },
      },
    ],
  },
};

describe('levelSql', () => {
  it('builds the example query, one clause per line', () => {
    expect(levelSql(example)).toBe(
      [
        'SELECT customers.name, orders.amount',
        'FROM customers',
        'JOIN orders ON orders.customer_id = customers.customer_id',
        "WHERE lower(customers.city) = 'reykjavik'",
        "  AND orders.created_at >= '2024-07-01'",
        '  AND orders.amount * 10 IN (100, 200, 300)',
        'ORDER BY orders.created_at',
      ].join('\n'),
    );
  });

  it('builds a query on one table without ORDER BY', () => {
    expect(levelSql(one)).toBe(
      "SELECT customers.name\nFROM customers\nWHERE customers.country IN ('IS', 'o''k')",
    );
  });

  it('joins three tables in an order where each joins an earlier one', () => {
    expect(levelSql(three)).toBe(
      [
        'SELECT customers.name, orders.amount',
        'FROM items',
        'JOIN orders ON orders.order_id = items.order_id',
        'JOIN customers ON customers.customer_id = orders.customer_id',
        'ORDER BY orders.created_at',
      ].join('\n'),
    );
  });
});

describe('tableFilter', () => {
  it("writes each table's filters without the table name, or null", () => {
    expect(tableFilter(example, 'customers')).toBe("lower(city) = 'reykjavik'");
    expect(tableFilter(example, 'orders')).toBe(
      "created_at >= '2024-07-01' AND amount * 10 IN (100, 200, 300)",
    );
    expect(tableFilter(three, 'items')).toBeNull();
  });
});

describe('query', () => {
  it('gives measure each table with its filters and indexes, and the joins', () => {
    expect(query(example)).toEqual({
      tables: [
        {
          name: 'customers',
          filters: [at(example.level.filters, 0)],
          indexes: [{ name: 'customers_pkey', column: 'customer_id' }],
        },
        {
          name: 'orders',
          filters: example.level.filters.slice(1),
          indexes: [{ name: 'orders_customer_id_idx', column: 'customer_id' }],
        },
      ],
      joins: example.level.joins,
    });
  });
});

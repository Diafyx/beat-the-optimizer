import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levelChecker } from '../scripts/lib/levels.ts';
import { measure } from './counts.ts';
import { postgresVersion, statsColumns, writeLevel, type Measured } from './level.ts';
import { query } from './query.ts';
import { SETTINGS } from './settings.ts';
import { parseSpec, type Spec } from './spec.ts';

const example = parseSpec(
  readFileSync(new URL('fixtures/example-spec.yaml', import.meta.url), 'utf8'),
);
const check = levelChecker(
  readFileSync(new URL('../schema/level.schema.json', import.meta.url), 'utf8'),
);

const scan = (table: string, rows: number, cost: number) => ({
  'Node Type': 'Seq Scan',
  'Relation Name': table,
  Alias: table,
  'Plan Rows': rows,
  'Total Cost': cost,
});

/** What PostgreSQL might report for the example spec: a hash join from orders. */
const measured: Measured = {
  version: '180001',
  settings: { ...SETTINGS },
  stats: [
    {
      table: 'customers',
      column: 'city',
      nullFraction: 0,
      distinct: -0.1,
      mostCommonValues: ['lisbon', 'reykjavik'],
      mostCommonFrequencies: [0.75, 0.25],
      histogram: null,
      correlation: 0.61,
    },
    {
      table: 'orders',
      column: 'customer_id',
      nullFraction: 0,
      distinct: 20,
      mostCommonValues: null,
      mostCommonFrequencies: null,
      histogram: [1, 5, 10, 15, 20],
      correlation: 0.02,
    },
  ],
  explain: [
    {
      Plan: {
        'Node Type': 'Hash Join',
        'Plan Rows': 3,
        'Total Cost': 6.9,
        Plans: [
          scan('orders', 12, 5.5),
          {
            'Node Type': 'Hash',
            'Plan Rows': 5,
            'Total Cost': 1.25,
            Plans: [scan('customers', 5, 1.25)],
          },
        ],
      },
    },
  ],
  // Any counts will do; each query's length is a stable one.
  cardinalities: measure(query(example), (sql) => sql.length),
};

describe('writeLevel', () => {
  it('writes a level that passes the schema and every rule', () => {
    const level = writeLevel(example, measured);
    expect(check(JSON.stringify(level))).toEqual([]);
    expect(level).toMatchObject({
      format: 1,
      id: 'reykjavik-orders',
      title: 'Orders from Reykjavik',
      story: example.level.story,
      joins: example.level.joins,
      orderBy: { table: 'orders', column: 'created_at' },
      locks: example.level.locks,
      cardinalities: measured.cardinalities,
      explanation: example.level.explanation,
    });
    expect(level.sql).toMatch(/^SELECT customers\.name, orders\.amount\nFROM customers\n/);
    expect(level.optimizer).toMatchObject({
      postgres: '18.1',
      settings: SETTINGS,
      plan: {
        first: { table: 'orders', access: 'seq' },
        steps: [{ join: 'hash', scan: { table: 'customers', access: 'seq' } }],
      },
    });
    expect(level.costs.best).toBeLessThanOrEqual(level.costs.optimizer);
  });

  it("describes each table, with statistics only for the level's stats columns", () => {
    const [customers, orders] = writeLevel(example, measured).tables;
    expect(customers).toEqual({
      name: 'customers',
      rows: 20,
      filter: "city = 'reykjavik'",
      storedOrder: 'customer_id',
      columns: [
        { name: 'customer_id', type: 'integer', stats: null },
        { name: 'name', type: 'text', stats: null },
        {
          name: 'city',
          type: 'text',
          stats: {
            nullFraction: 0,
            distinct: 2,
            mostCommon: [
              { value: 'lisbon', frequency: 0.75 },
              { value: 'reykjavik', frequency: 0.25 },
            ],
            histogram: [],
            correlation: 0.61,
          },
        },
        { name: 'country', type: 'text', stats: null },
      ],
      indexes: [{ name: 'customers_pkey', column: 'customer_id' }],
    });
    expect(orders?.storedOrder).toBeNull();
    expect(orders?.columns.map(({ stats }) => stats?.distinct ?? null)).toEqual([
      null,
      20,
      null,
      null,
    ]);
  });

  it('fails when the level breaks a rule', () => {
    const locked: Spec = {
      ...example,
      level: {
        ...example.level,
        locks: [
          {
            kind: 'access',
            scan: { table: 'customers', access: 'index', index: 'customers_pkey' },
          },
        ],
      },
    };
    expect(() => writeLevel(locked, measured)).toThrow(
      'The level reykjavik-orders is invalid:\n  rule 7: The locks do not allow optimizer.plan, so the player cannot match it',
    );
  });

  it('fails when PostgreSQL does not have the authoring settings', () => {
    expect(() =>
      writeLevel(example, { ...measured, settings: { ...SETTINGS, jit: 'on' } }),
    ).toThrow('jit is "on", not off');
  });
});

describe('statsColumns', () => {
  it("gives each stats column's type and its table's rows", () => {
    expect(statsColumns(example)).toEqual([
      { table: 'customers', column: 'city', type: 'text', rows: 20 },
      { table: 'orders', column: 'customer_id', type: 'integer', rows: 200 },
    ]);
  });
});

describe('postgresVersion', () => {
  it.each([
    ['180001', '18.1'],
    ['100023', '10.23'],
  ])('reads %s as %s', (number, version) => {
    expect(postgresVersion(number)).toBe(version);
  });

  it.each(['90605', '18.1', '0180001', ''])('rejects %j', (number) => {
    expect(() => postgresVersion(number)).toThrow(
      `server_version_num ${number} is not a PostgreSQL 10 or later version`,
    );
  });
});

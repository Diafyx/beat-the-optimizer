import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { dayNumber, parseSpec } from './spec.ts';

const exampleText = readFileSync(new URL('fixtures/example-spec.yaml', import.meta.url), 'utf8');

type Path = readonly (string | number)[];

/** The example spec as YAML, with the value at `path` replaced. */
function variant(path: Path, value: unknown): string {
  const spec = parse(exampleText) as Record<string | number, unknown>;
  let node = spec;
  for (const step of path.slice(0, -1)) node = node[step] as Record<string | number, unknown>;
  node[path[path.length - 1] ?? ''] = value;
  return stringify(spec);
}

const customers = ['tables', 0];
const orders = ['tables', 1];

describe('parseSpec', () => {
  it('reads the example spec', () => {
    const spec = parseSpec(exampleText);
    expect(spec.seed).toBe(7);
    expect(spec.tables.map(({ name, rows }) => [name, rows])).toEqual([
      ['customers', 20],
      ['orders', 200],
    ]);
    expect(spec.afterAnalyze).toHaveLength(1);
  });

  it('lists every schema error', () => {
    const text = variant(['seed'], -1).replace('afterAnalyze', 'after');
    expect(() => parseSpec(text)).toThrow(
      [
        'Invalid level spec:',
        "  spec must have required property 'afterAnalyze'",
        '  spec must NOT have additional properties',
        '  spec/seed must be >= 0',
      ].join('\n'),
    );
  });

  it.each<[string, Path, unknown, string]>([
    [
      'a repeated table',
      ['tables', 1, 'name'],
      'customers',
      'The table customers is defined more than once',
    ],
    [
      'a repeated index',
      [...orders, 'indexes', 0, 'name'],
      'customers_pkey',
      'The index customers_pkey is defined more than once',
    ],
    [
      'a repeated column',
      [...customers, 'columns', 1, 'name'],
      'customer_id',
      'The column customers.customer_id is defined more than once',
    ],
    [
      'an insert order on a missing column',
      [...customers, 'order'],
      'id',
      'customers is inserted in order of id, which is not a column',
    ],
    [
      'an index on a missing column',
      [...orders, 'indexes', 0, 'column'],
      'customer',
      'The index orders_customer_id_idx is on customer, which is not a column',
    ],
    [
      'a uniform range upside down',
      [...orders, 'columns', 2, 'values'],
      { kind: 'uniform', min: 5, max: 4 },
      'orders.amount has min 5 above max 4',
    ],
    [
      'a date that does not exist',
      [...orders, 'columns', 3, 'values', 'to'],
      '2024-02-30',
      'orders.created_at needs two real dates, from 2024-01-01 to 2024-02-30',
    ],
    [
      'a date that does not parse',
      [...orders, 'columns', 3, 'values', 'from'],
      '2024-13-01',
      'orders.created_at needs two real dates, from 2024-13-01 to 2024-12-31',
    ],
    [
      'a date range upside down',
      [...orders, 'columns', 3, 'values', 'from'],
      '2025-01-01',
      'orders.created_at needs two real dates, from 2025-01-01 to 2024-12-31',
    ],
    [
      'a reference to a later table',
      [...customers, 'columns', 1, 'values'],
      { kind: 'reference', table: 'orders', column: 'order_id' },
      'customers.name references orders.order_id, which is not a column of an earlier table',
    ],
    [
      'a reference to a missing column',
      [...orders, 'columns', 1, 'values', 'column'],
      'id',
      'orders.customer_id references customers.id, which is not a column of an earlier table',
    ],
    [
      'a column derived from a later column',
      [...customers, 'columns', 3, 'values', 'column'],
      'zone',
      'customers.country is derived from zone, which is not an earlier column',
    ],
  ])('rejects %s', (_, path, value, problem) => {
    expect(() => parseSpec(variant(path, value))).toThrow(`Invalid level spec:\n  ${problem}`);
  });
});

describe('dayNumber', () => {
  it.each([
    ['1970-01-01', 0],
    ['2024-02-29', 19_782],
    ['2023-02-29', NaN],
    ['2023-13-01', NaN],
  ])('gives %s day %d', (date, day) => {
    expect(dayNumber(date)).toBe(day);
  });
});

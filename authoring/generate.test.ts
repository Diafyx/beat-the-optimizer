import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { at, exactCounts, generate, type TableData } from './generate.ts';
import { hash } from './random.ts';
import { dayNumber, parseSpec, type ColumnSpec, type Dataset } from './spec.ts';

const example = parseSpec(
  readFileSync(new URL('fixtures/example-spec.yaml', import.meta.url), 'utf8'),
);

/** A one-table spec with `rows` rows and the given columns. */
const single = (rows: number, order: string, ...columns: ColumnSpec[]): Dataset => ({
  seed: 1,
  tables: [{ name: 't', rows, order, columns, indexes: [] }],
  afterAnalyze: [],
});

/** The values of `column` in insert order. */
function values(table: TableData | undefined, column: string): unknown[] {
  if (table === undefined) throw new Error('No table');
  const i = table.columns.indexOf(column);
  return table.rows.map((row) => row[i]);
}

const counts = (items: readonly unknown[]): Map<unknown, number> => {
  const found = new Map<unknown, number>();
  for (const item of items) found.set(item, (found.get(item) ?? 0) + 1);
  return found;
};

describe('generate', () => {
  it('gives byte-identical output for the same spec', () => {
    const output = JSON.stringify(generate(example));
    expect(
      JSON.stringify(
        generate(
          parseSpec(readFileSync(new URL('fixtures/example-spec.yaml', import.meta.url), 'utf8')),
        ),
      ),
    ).toBe(output);
    // Any change to the generator or the random numbers changes this hash.
    expect(hash(output)).toBe(32240044);
  });

  it('generates the example in insert order', () => {
    const [customers, orders] = generate(example);
    expect(customers?.columns).toEqual(['customer_id', 'name', 'city', 'country']);
    expect(customers?.rows.slice(0, 3)).toEqual([
      [1, 'customer 1', 'reykjavik', 'IS'],
      [2, 'customer 2', 'reykjavik', 'IS'],
      [3, 'customer 3', 'reykjavik', 'IS'],
    ]);
    expect(orders?.rows.slice(0, 2)).toEqual([
      [1051, 10, 32, '2024-09-12'],
      [1049, 6, 12, '2024-07-09'],
    ]);
  });

  it('keeps the other columns when one column changes', () => {
    const table = at(example.tables, 1);
    const changed: Dataset = {
      ...example,
      tables: [
        at(example.tables, 0),
        {
          ...table,
          columns: table.columns.map((column) =>
            column.name === 'amount'
              ? { ...column, values: { kind: 'uniform', min: 500, max: 600 } }
              : column,
          ),
        },
      ],
    };
    const [, before] = generate(example);
    const [, after] = generate(changed);
    expect(values(after, 'created_at')).toEqual(values(before, 'created_at'));
    expect(values(after, 'amount')).not.toEqual(values(before, 'amount'));
  });

  it('numbers a sequence from 1 or from start, and labels rows from 1', () => {
    const [table] = generate(
      single(
        3,
        'a',
        { name: 'a', type: 'integer', values: { kind: 'sequence' } },
        { name: 'b', type: 'integer', values: { kind: 'sequence', start: -1 } },
        { name: 'c', type: 'text', values: { kind: 'label', prefix: 'row ' } },
      ),
    );
    expect(table?.rows).toEqual([
      [1, -1, 'row 1'],
      [2, 0, 'row 2'],
      [3, 1, 'row 3'],
    ]);
  });

  it('draws uniform integers within 3% of an even split', () => {
    const [table] = generate(
      single(100_000, 'shuffled', {
        name: 'a',
        type: 'integer',
        values: { kind: 'uniform', min: 0, max: 9 },
      }),
    );
    const found = counts(values(table, 'a'));
    expect([...found.keys()].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const count of found.values()) expect(Math.abs(count - 10_000)).toBeLessThan(300);
  });

  it('gives weighted values exactly their share, in random order', () => {
    const [table] = generate(
      single(1_000, 'shuffled', {
        name: 'status',
        type: 'text',
        values: {
          kind: 'weighted',
          weights: [
            { value: 'shipped', weight: 70 },
            { value: 'pending', weight: 0.1 },
            { value: 'returned', weight: 29.9 },
          ],
        },
      }),
    );
    const statuses = values(table, 'status');
    expect(counts(statuses)).toEqual(
      new Map([
        ['shipped', 700],
        ['pending', 1],
        ['returned', 299],
      ]),
    );
    // Not grouped by value: the first 100 rows hold about 70 shipped.
    const firstShipped = statuses.slice(0, 100).filter((status) => status === 'shipped').length;
    expect(Math.abs(firstShipped - 70)).toBeLessThan(15);
  });

  it('draws dates from the whole range, within 5% of an even split by quarter', () => {
    const [table] = generate(
      single(40_000, 'shuffled', {
        name: 'd',
        type: 'date',
        values: { kind: 'dateRange', from: '2023-01-01', to: '2023-12-31' },
      }),
    );
    const dates = values(table, 'd') as string[];
    expect([...dates].sort()[0]).toBe('2023-01-01');
    expect([...dates].sort().at(-1)).toBe('2023-12-31');
    const quarters = counts(
      dates.map((date) => Math.floor((dayNumber(date) - dayNumber('2023-01-01')) / 91.25)),
    );
    for (const count of quarters.values()) expect(Math.abs(count - 10_000)).toBeLessThan(500);
  });

  it('references values of the earlier table, about evenly', () => {
    const [customers, orders] = generate(example);
    const ids = new Set(values(customers, 'customer_id'));
    const found = counts(values(orders, 'customer_id'));
    expect([...found.keys()].every((id) => ids.has(id))).toBe(true);
    // 10 orders per customer expected out of 200.
    for (const count of found.values()) expect(count).toBeLessThan(25);
  });

  it('derives a fully correlated column through its map', () => {
    const [customers] = generate(example);
    const pairs = new Set(customers?.rows.map((row) => `${String(row[2])}:${String(row[3])}`));
    expect(pairs).toEqual(new Set(['reykjavik:IS', 'lisbon:PT']));
  });

  it('fails on a source value with no mapping', () => {
    const spec = single(
      4,
      'shuffled',
      { name: 'a', type: 'integer', values: { kind: 'sequence' } },
      {
        name: 'b',
        type: 'text',
        values: { kind: 'derived', column: 'a', map: [{ from: 1, to: 'one' }] },
      },
    );
    expect(() => generate(spec)).toThrow('t.b has no mapping for the a value 2');
  });

  it('inserts in ascending order of a column, keeping generation order on ties', () => {
    const [table] = generate(
      single(
        6,
        'group',
        { name: 'id', type: 'integer', values: { kind: 'sequence' } },
        {
          name: 'group',
          type: 'text',
          values: {
            kind: 'derived',
            column: 'id',
            map: [1, 2, 3, 4, 5, 6].map((id) => ({ from: id, to: id % 2 === 0 ? 'b' : 'a' })),
          },
        },
      ),
    );
    expect(values(table, 'id')).toEqual([1, 3, 5, 2, 4, 6]);
  });

  it('shuffles the insert order of a shuffled table', () => {
    const [table] = generate(
      single(100, 'shuffled', { name: 'id', type: 'integer', values: { kind: 'sequence' } }),
    );
    const ids = values(table, 'id') as number[];
    expect([...ids].sort((x, y) => x - y)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(ids).not.toEqual([...ids].sort((x, y) => x - y));
  });

  it('fails on a column that is not generated yet, which parseSpec rules out', () => {
    const spec = single(1, 'shuffled', {
      name: 'a',
      type: 'integer',
      values: { kind: 'reference', table: 'u', column: 'id' },
    });
    expect(() => generate(spec)).toThrow('u.id has not been generated yet');
  });
});

describe('exactCounts', () => {
  const weights = (...list: number[]) => list.map((weight, i) => ({ value: i, weight }));

  it.each([
    ['splits evenly', [1, 1], 4, [2, 2]],
    ['gives the remainder to the largest remainders', [1, 1, 1], 10, [4, 3, 3]],
    ['breaks a tie for the remainder by order', [1, 2, 1], 2, [1, 1, 0]],
    ['gives a tiny weight a row when its remainder is the largest', [99.4, 0.6], 100, [99, 1]],
  ])('%s', (_, list, rows, expected) => {
    expect(exactCounts(weights(...list), rows).map(({ count }) => count)).toEqual(expected);
  });
});

describe('at', () => {
  it('returns the item, or throws past the end', () => {
    expect(at(['a', 'b'], 1)).toBe('b');
    expect(() => at(['a'], 1)).toThrow(new RangeError('Nothing at index 1 of 1'));
  });
});

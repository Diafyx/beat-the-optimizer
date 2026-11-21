import { describe, expect, it } from 'vitest';
import { mapStats, statsSql, type StatsColumn } from './stats.ts';

const createdAt: StatsColumn = { table: 'orders', column: 'created_at', type: 'date', rows: 200 };
const amount: StatsColumn = { table: 'orders', column: 'amount', type: 'integer', rows: 200 };
const city: StatsColumn = { table: 'customers', column: 'city', type: 'text', rows: 20 };

/** pg_stats rows as statsSql returns them. */
const recorded = [
  {
    table: 'orders',
    column: 'created_at',
    nullFraction: 0,
    distinct: -0.835,
    mostCommonValues: ['2024-03-14', '2024-09-02'],
    mostCommonFrequencies: [0.015, 0.015],
    histogram: ['2024-01-01', '2024-04-17', '2024-08-30', '2024-12-31'],
    correlation: -0.04117281,
  },
  {
    table: 'orders',
    column: 'amount',
    nullFraction: 0.05,
    distinct: 101,
    mostCommonValues: null,
    mostCommonFrequencies: null,
    histogram: [0, 25, 50, 75, 100],
    correlation: null,
  },
];

describe('statsSql', () => {
  it("selects each column's pg_stats row, with arrays cast to the column's type", () => {
    const row = (type: string, table: string, column: string) =>
      [
        'SELECT json_build_object(',
        "  'table', tablename, 'column', attname,",
        "  'nullFraction', null_frac, 'distinct', n_distinct,",
        `  'mostCommonValues', most_common_vals::text::${type}[],`,
        "  'mostCommonFrequencies', most_common_freqs,",
        `  'histogram', histogram_bounds::text::${type}[],`,
        "  'correlation', correlation",
        ') AS entry FROM pg_stats',
        `WHERE schemaname = current_schema() AND NOT inherited AND tablename = '${table}' AND attname = '${column}'`,
      ].join('\n');
    expect(statsSql([createdAt, city])).toBe(
      `SELECT json_agg(entry) FROM (\n${row('date', 'orders', 'created_at')}\nUNION ALL\n${row('text', 'customers', 'city')}\n) AS stats`,
    );
  });

  it('needs a column', () => {
    expect(() => statsSql([])).toThrow('statsSql needs at least one column');
  });
});

describe('mapStats', () => {
  it('maps recorded rows in the order asked, with n_distinct as a count', () => {
    expect(mapStats(recorded, [amount, createdAt])).toEqual([
      {
        nullFraction: 0.05,
        distinct: 101,
        mostCommon: [],
        histogram: [0, 25, 50, 75, 100],
        correlation: null,
      },
      {
        nullFraction: 0,
        distinct: 167,
        mostCommon: [
          { value: '2024-03-14', frequency: 0.015 },
          { value: '2024-09-02', frequency: 0.015 },
        ],
        histogram: ['2024-01-01', '2024-04-17', '2024-08-30', '2024-12-31'],
        correlation: -0.04117281,
      },
    ]);
  });

  it('reads a missing histogram, as when every value is a most common one, as empty', () => {
    const [stats] = mapStats([{ ...recorded[1], histogram: null }], [amount]);
    expect(stats?.histogram).toEqual([]);
  });

  it.each([null, [], ['not a row', { table: 'orders' }]])(
    'fails when a column has no row, in %j',
    (output) => {
      expect(() => mapStats(output, [amount])).toThrow(
        'pg_stats has no row for orders.amount; was the table analysed?',
      );
    },
  );

  it('rejects output that is not an array', () => {
    expect(() => mapStats({ table: 'orders' }, [amount])).toThrow(
      'pg_stats output must be a JSON array',
    );
  });

  it.each([
    ['nullFraction', '0'],
    ['distinct', null],
    ['mostCommonValues', 'lisbon'],
    ['mostCommonValues', [{ value: 1 }]],
    ['mostCommonFrequencies', ['0.5']],
    ['histogram', [null]],
    ['correlation', '1'],
  ])('rejects a malformed %s, %j', (key, value) => {
    const row = { ...recorded[1], [key]: value };
    expect(() => mapStats([row], [amount])).toThrow(
      `The pg_stats row for orders.amount has a malformed "${key}"`,
    );
  });

  it('rejects most common values without a frequency each', () => {
    const row = { ...recorded[1], mostCommonValues: [1, 2], mostCommonFrequencies: [0.5] };
    expect(() => mapStats([row], [amount])).toThrow(
      'The pg_stats row for orders.amount has 2 most common values and 1 frequencies',
    );
  });
});

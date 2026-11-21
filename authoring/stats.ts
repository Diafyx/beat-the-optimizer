/**
 * Column statistics from PostgreSQL's `pg_stats` view after `ANALYZE`, as the
 * level format's `stats` (docs/level-format.md, Tables).
 */
import type { ColumnStats, Scalar } from '../src/engine/level.ts';
import { isObject, type Json } from './explain.ts';
import { at } from './generate.ts';
import type { ColumnSpec } from './spec.ts';
import { literal } from './sql.ts';

export interface StatsColumn {
  readonly table: string;
  readonly column: string;
  readonly type: ColumnSpec['type'];
  /** The table's true row count, which turns a negative `n_distinct` into a count. */
  readonly rows: number;
}

/**
 * One `pg_stats` row as JSON. `anyarray` columns cannot be turned into JSON
 * directly, so they go through text to an array of the column's type, which
 * keeps numbers as numbers and writes dates in ISO 8601.
 */
const rowSql = ({ table, column, type }: StatsColumn): string =>
  [
    'SELECT json_build_object(',
    "  'table', tablename, 'column', attname,",
    "  'nullFraction', null_frac, 'distinct', n_distinct,",
    `  'mostCommonValues', most_common_vals::text::${type}[],`,
    "  'mostCommonFrequencies', most_common_freqs,",
    `  'histogram', histogram_bounds::text::${type}[],`,
    "  'correlation', correlation",
    ') AS entry FROM pg_stats',
    `WHERE schemaname = current_schema() AND NOT inherited AND tablename = ${literal(table)} AND attname = ${literal(column)}`,
  ].join('\n');

/** A query that returns the `pg_stats` rows of `columns` as one JSON array. */
export function statsSql(columns: readonly StatsColumn[]): string {
  if (columns.length === 0) throw new Error('statsSql needs at least one column');
  return `SELECT json_agg(entry) FROM (\n${columns.map(rowSql).join('\nUNION ALL\n')}\n) AS stats`;
}

const isScalar = (value: unknown): value is Scalar =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
const isNumber = (value: unknown): value is number => typeof value === 'number';
const listOf =
  <T>(item: (value: unknown) => value is T) =>
  (value: unknown): value is readonly T[] | null =>
    value === null || (Array.isArray(value) && value.every(item));

function field<T>(row: Json, where: string, key: string, check: (value: unknown) => value is T) {
  const value = row[key];
  if (!check(value)) throw new Error(`The pg_stats row for ${where} has a malformed "${key}"`);
  return value;
}

function columnStats(row: Json, { table, column, rows }: StatsColumn): ColumnStats {
  const where = `${table}.${column}`;
  const values = field(row, where, 'mostCommonValues', listOf(isScalar)) ?? [];
  const frequencies = field(row, where, 'mostCommonFrequencies', listOf(isNumber)) ?? [];
  if (values.length !== frequencies.length) {
    throw new Error(
      `The pg_stats row for ${where} has ${String(values.length)} most common values and ${String(frequencies.length)} frequencies`,
    );
  }
  const distinct = field(row, where, 'distinct', isNumber);
  return {
    nullFraction: field(row, where, 'nullFraction', isNumber),
    // A negative n_distinct is minus a fraction of the rows.
    distinct: Math.round(distinct < 0 ? -distinct * rows : distinct),
    mostCommon: values.map((value, i) => ({ value, frequency: at(frequencies, i) })),
    histogram: field(row, where, 'histogram', listOf(isScalar)) ?? [],
    correlation: field(row, where, 'correlation', (value) => value === null || isNumber(value)),
  };
}

/**
 * The statistics of each of `columns`, in order, from `output`, the parsed
 * result of `statsSql(columns)`.
 */
export function mapStats(output: unknown, columns: readonly StatsColumn[]): ColumnStats[] {
  // json_agg returns null when no row matches.
  const rows = output ?? [];
  if (!Array.isArray(rows)) throw new Error('pg_stats output must be a JSON array');
  return columns.map((wanted) => {
    const row: unknown = rows.find(
      (candidate) =>
        isObject(candidate) &&
        candidate['table'] === wanted.table &&
        candidate['column'] === wanted.column,
    );
    if (!isObject(row)) {
      throw new Error(
        `pg_stats has no row for ${wanted.table}.${wanted.column}; was the table analysed?`,
      );
    }
    return columnStats(row, wanted);
  });
}

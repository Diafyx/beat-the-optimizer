/**
 * Measures a level's true cardinalities (docs/level-format.md, Cardinalities)
 * on the generated data: one `SELECT count(*)` for every entry rule 4
 * requires, run by the caller.
 */
import { joinPredicate } from '../src/engine/cost.ts';
import type { Cardinalities, ColumnRef, Index, JoinPredicate } from '../src/engine/level.ts';
import { connectedSets } from '../src/engine/validate.ts';
import type { Value } from './spec.ts';
import { literal, quote } from './sql.ts';

/** A predicate on one column of a table. */
export type Filter =
  | {
      readonly column: string;
      readonly op: '=' | '<' | '<=' | '>' | '>=';
      readonly value: Value;
    }
  | { readonly column: string; readonly op: 'in'; readonly values: readonly Value[] };

export interface QueryTable {
  readonly name: string;
  /** The query's predicates on this table; a row must pass all of them. */
  readonly filters: readonly Filter[];
  readonly indexes: readonly Index[];
}

/** The parts of a level's query that its cardinalities depend on. */
export interface Query {
  readonly tables: readonly QueryTable[];
  readonly joins: readonly JoinPredicate[];
}

const column = ({ table, column: name }: ColumnRef): string => `${quote(table)}.${quote(name)}`;

const equal = (left: ColumnRef, right: ColumnRef): string => `${column(left)} = ${column(right)}`;

/** `filter` as SQL, on a column of `table`. */
function filterSql(table: string, filter: Filter): string {
  const target = column({ table, column: filter.column });
  return filter.op === 'in'
    ? `${target} IN (${filter.values.map(literal).join(', ')})`
    : `${target} ${filter.op} ${literal(filter.value)}`;
}

const countSql = (tables: readonly string[], where: readonly string[]): string =>
  `SELECT count(*) FROM ${tables.map(quote).join(', ')}` +
  (where.length === 0 ? '' : ` WHERE ${where.join(' AND ')}`);

/**
 * The cardinalities of `query`. `count` runs one `SELECT count(*)` query and
 * returns its result; each distinct query runs once.
 */
export function measure(query: Query, count: (sql: string) => number): Cardinalities {
  const counted = new Map<string, number>();
  const run = (tables: readonly string[], where: readonly string[]): number => {
    const sql = countSql(tables, where);
    const known = counted.get(sql);
    if (known !== undefined) return known;
    const rows = count(sql);
    if (!Number.isSafeInteger(rows) || rows < 0) {
      throw new Error(`${sql} returned ${String(rows)}, which is not a row count`);
    }
    counted.set(sql, rows);
    return rows;
  };
  /** The filters of every table in `tables`, as SQL. */
  const filters = (tables: readonly string[]): string[] =>
    query.tables
      .filter(({ name }) => tables.includes(name))
      .flatMap(({ name, filters: own }) => own.map((filter) => filterSql(name, filter)));
  /** The join predicates between tables in `tables`, as SQL. */
  const predicates = (tables: readonly string[]): string[] =>
    query.joins
      .filter(({ left, right }) => tables.includes(left.table) && tables.includes(right.table))
      .map(({ left, right }) => equal(left, right));
  const sets = connectedSets(query);

  return {
    scans: query.tables.map(({ name, filters: own, indexes }) => ({
      table: name,
      filtered: run([name], filters([name])),
      // An index scan reads the rows its index condition, the filters on its
      // column, matches.
      indexes: indexes.map((index) => ({
        index: index.name,
        matched: run(
          [name],
          own.filter((filter) => filter.column === index.column).map((f) => filterSql(name, f)),
        ),
      })),
    })),
    joins: sets
      .filter((set) => set.length > 1)
      .map((set) => ({ tables: set, rows: run(set, [...predicates(set), ...filters(set)]) })),
    // An index nested loop fetches the inner rows that match each outer row
    // on the join predicate, before the inner table's filters.
    lookups: sets.flatMap((outer) =>
      query.tables
        .filter(({ name }) => !outer.includes(name))
        .flatMap(({ name, indexes }) => {
          const predicate = joinPredicate(query, outer, name);
          if (predicate === undefined) return [];
          const [outerColumn, innerColumn] = predicate;
          return indexes
            .filter((index) => index.column === innerColumn.column)
            .map((index) => ({
              outer,
              index: index.name,
              fetched: run(
                [...outer, name],
                [...predicates(outer), equal(outerColumn, innerColumn), ...filters(outer)],
              ),
            }));
        }),
    ),
  };
}

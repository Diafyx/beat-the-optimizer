/**
 * A level's query, built from the parts in its spec's `level` section, so the
 * SQL that PostgreSQL plans is the SQL the level shows. The spec must be valid.
 */
import type { ColumnRef } from '../src/engine/level.ts';
import { condition, type Query } from './counts.ts';
import { at } from './generate.ts';
import type { Spec } from './spec.ts';

/** Names are not quoted, so the SQL reads as written; see docs/level-spec.md. */
const ref = ({ table, column }: ColumnRef): string => `${table}.${column}`;

/**
 * FROM the first table, then JOIN each table that a join predicate links to
 * the tables before it. The joins form a tree, so this reaches every table.
 */
function from({ tables, level }: Spec): string[] {
  const joined = [at(tables, 0).name];
  const lines = [`FROM ${at(joined, 0)}`];
  for (const table of joined) {
    for (const { left, right } of level.joins) {
      const [mine, other] = left.table === table ? [left, right] : [right, left];
      if (mine.table === table && !joined.includes(other.table)) {
        joined.push(other.table);
        lines.push(`JOIN ${other.table} ON ${ref(other)} = ${ref(mine)}`);
      }
    }
  }
  return lines;
}

/** The level's `sql`: its query, one clause per line. */
export function levelSql(spec: Spec): string {
  const { select, filters, orderBy } = spec.level;
  const where = filters.map((filter) => condition(ref(filter), filter));
  return [
    `SELECT ${select.map(ref).join(', ')}`,
    ...from(spec),
    ...where.map((line, i) => (i === 0 ? `WHERE ${line}` : `  AND ${line}`)),
    ...(orderBy === null ? [] : [`ORDER BY ${ref(orderBy)}`]),
  ].join('\n');
}

/** A table's `filter` in the level file: its filters, for display, or null if it has none. */
export function tableFilter(spec: Spec, table: string): string | null {
  const own = spec.level.filters.filter((filter) => filter.table === table);
  return own.length === 0
    ? null
    : own.map((filter) => condition(filter.column, filter)).join(' AND ');
}

/** The tables, filters and join predicates that `measure` counts. */
export function query(spec: Spec): Query {
  return {
    tables: spec.tables.map(({ name, indexes }) => ({
      name,
      filters: spec.level.filters.filter(({ table }) => table === name),
      indexes: indexes.map(({ name: index, column }) => ({ name: index, column })),
    })),
    joins: spec.level.joins,
  };
}

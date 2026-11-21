/**
 * Writes a level file (docs/level-format.md) from a spec and what PostgreSQL
 * reported for it. The costs come from the engine, and the level must pass
 * validation.
 */
import type { Cardinalities, Level } from '../src/engine/level.ts';
import { planCost } from '../src/engine/cost.ts';
import { bestPlan } from '../src/engine/plans.ts';
import { validateLevel } from '../src/engine/validate.ts';
import { mapExplain } from './explain.ts';
import { levelSql, tableFilter } from './query.ts';
import { checkSettings } from './settings.ts';
import type { Spec } from './spec.ts';
import { mapStats, type StatsColumn } from './stats.ts';

/** What authoring read from PostgreSQL, parsed where it is JSON. */
export interface Measured {
  /** `SHOW server_version_num`, such as `180001`. */
  readonly version: string;
  /** The result of `showSettingsSql()`. */
  readonly settings: unknown;
  /** The result of `statsSql(statsColumns(spec))`, or anything if there are none. */
  readonly stats: unknown;
  /** The result of `EXPLAIN (FORMAT JSON)` on `levelSql(spec)`. */
  readonly explain: unknown;
  readonly cardinalities: Cardinalities;
}

/** `major.minor` from `server_version_num`, which is major × 10000 + minor. */
export function postgresVersion(number: string): string {
  if (!/^[1-9][0-9]{5}$/.test(number)) {
    throw new Error(`server_version_num ${number} is not a PostgreSQL 10 or later version`);
  }
  const value = Number(number);
  return `${String(Math.floor(value / 10_000))}.${String(value % 10_000)}`;
}

/** The columns whose statistics the level shows, as `statsSql` takes them. */
export function statsColumns({ tables, level }: Spec): StatsColumn[] {
  return level.stats.flatMap(({ table, column }) =>
    tables
      .filter(({ name }) => name === table)
      .flatMap(({ rows, columns }) =>
        columns
          .filter(({ name }) => name === column)
          .map(({ type }) => ({ table, column, type, rows })),
      ),
  );
}

/** The level file for `spec`. Throws if PostgreSQL's settings or the level are wrong. */
export function writeLevel(spec: Spec, measured: Measured): Level {
  const { level } = spec;
  const wanted = statsColumns(spec);
  const stats = mapStats(measured.stats, wanted);
  const { plan, explain } = mapExplain(measured.explain);
  const withoutCosts: Level = {
    format: 1,
    id: level.id,
    title: level.title,
    story: level.story,
    sql: levelSql(spec),
    tables: spec.tables.map(({ name, rows, order, columns, indexes }) => ({
      name,
      rows,
      filter: tableFilter(spec, name),
      storedOrder: order === 'shuffled' ? null : order,
      columns: columns.map((column) => {
        const i = wanted.findIndex((ref) => ref.table === name && ref.column === column.name);
        return { name: column.name, type: column.type, stats: stats[i] ?? null };
      }),
      indexes: indexes.map(({ name: index, column }) => ({ name: index, column })),
    })),
    joins: level.joins,
    orderBy: level.orderBy,
    locks: level.locks,
    cardinalities: measured.cardinalities,
    optimizer: {
      postgres: postgresVersion(measured.version),
      settings: checkSettings(measured.settings),
      plan,
      explain,
    },
    costs: { best: 0, optimizer: 0, bestPlan: plan },
    explanation: level.explanation,
  };
  const best = bestPlan(withoutCosts);
  const written: Level = {
    ...withoutCosts,
    costs: {
      best: best.cost.total,
      optimizer: planCost(withoutCosts, plan).total,
      bestPlan: best.plan,
    },
  };
  const errors = validateLevel(written);
  if (errors.length > 0) {
    throw new Error(
      `The level ${level.id} is invalid:\n${errors.map(({ rule, message }) => `  rule ${String(rule)}: ${message}`).join('\n')}`,
    );
  }
  return written;
}

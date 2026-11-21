/**
 * The fixed PostgreSQL settings every level is authored with, recorded in its
 * `optimizer.settings` as `SHOW` prints them (docs/level-format.md, Optimizer).
 */
import { isObject } from './explain.ts';
import { literal } from './sql.ts';

/** Sorted by name; docs/level-format.md says why each is set. */
export const SETTINGS: Readonly<Record<string, string>> = {
  autovacuum: 'off',
  cpu_index_tuple_cost: '0.005',
  cpu_operator_cost: '0.0025',
  cpu_tuple_cost: '0.01',
  default_statistics_target: '10000',
  effective_cache_size: '4GB',
  jit: 'off',
  max_parallel_workers_per_gather: '0',
  random_page_cost: '4',
  seq_page_cost: '1',
  work_mem: '4MB',
};

/**
 * SQL that sets SETTINGS for every later connection. Run it with `psql -f`,
 * which sends one statement at a time: `ALTER SYSTEM` cannot run in a
 * transaction block.
 */
export function applySettingsSql(): string {
  return Object.entries(SETTINGS)
    .map(([name, value]) => `ALTER SYSTEM SET ${name} = ${literal(value)};\n`)
    .join('')
    .concat('SELECT pg_reload_conf();\n');
}

/** A query that returns every setting in SETTINGS, as `SHOW` prints it, as one JSON object. */
export function showSettingsSql(): string {
  const pairs = Object.keys(SETTINGS).map(
    (name) => `${literal(name)}, current_setting(${literal(name)})`,
  );
  return `SELECT json_build_object(${pairs.join(', ')})`;
}

/**
 * The settings to record, from `output`, the parsed result of
 * `showSettingsSql()`. Throws if PostgreSQL does not have SETTINGS.
 */
export function checkSettings(output: unknown): Record<string, string> {
  const shown = isObject(output) ? output : {};
  const wrong = Object.entries(SETTINGS).filter(([name, value]) => shown[name] !== value);
  if (wrong.length > 0) {
    const found = wrong.map(
      ([name, value]) =>
        `${name} is ${name in shown ? JSON.stringify(shown[name]) : 'missing'}, not ${value}`,
    );
    throw new Error(`PostgreSQL does not have the authoring settings: ${found.join('; ')}`);
  }
  return { ...SETTINGS };
}

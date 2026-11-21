// Authors every level: for each spec (scripts/lib/authoring.ts), loads its data
// into PostgreSQL, measures it and writes the level file, formatted by
// Prettier. It runs psql with the usual PG* environment variables, as a
// superuser (the settings use ALTER SYSTEM), and keeps the tables in the
// schema "authoring", which it drops and recreates. It needs a database, so it
// runs only in CI (.github/workflows/authoring.yml). The steps are in
// docs/level-spec.md.
import { execFileSync } from 'node:child_process';
import {
  createWriteStream,
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { format, resolveConfig } from 'prettier';
import { measure } from '../authoring/counts.ts';
import { generate } from '../authoring/generate.ts';
import { statsColumns, writeLevel } from '../authoring/level.ts';
import { levelSql, query } from '../authoring/query.ts';
import { applySettingsSql, checkSettings, showSettingsSql } from '../authoring/settings.ts';
import { parseSpec } from '../authoring/spec.ts';
import { afterAnalyzeSql, loadSql, quote } from '../authoring/sql.ts';
import { statsSql } from '../authoring/stats.ts';
import { authoringTargets, retry } from './lib/authoring.ts';

const targets = authoringTargets(
  process.argv.slice(2),
  globSync('levels/specs/*.yaml'),
  globSync('levels/*.json'),
);

const SCHEMA = 'authoring';
const env = { ...process.env, PGOPTIONS: `-c search_path=${SCHEMA}` };

/** Runs psql and returns what it prints: values only, unaligned. */
const psql = (args: readonly string[], input?: string): string =>
  execFileSync('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    env,
    maxBuffer: 1 << 28,
    ...(input === undefined ? {} : { input }),
  }).trim();
const run = (sql: string): string => psql(['-c', sql]);
const json = (sql: string): unknown => JSON.parse(run(sql));

// ALTER SYSTEM cannot run in a transaction, so the script goes through -f,
// which sends one statement at a time. The reload reaches new connections
// asynchronously, so SHOW is retried until it has the settings.
psql(['-f', '-'], applySettingsSql());
const settings = retry(
  () => {
    const shown = json(showSettingsSql());
    checkSettings(shown);
    return shown;
  },
  () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200),
  10,
);
const version = run('SHOW server_version_num');

const dir = mkdtempSync(join(tmpdir(), 'author-level-'));
try {
  for (const target of targets) {
    const spec = parseSpec(readFileSync(target.spec, 'utf8'));
    run(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    run(`CREATE SCHEMA ${SCHEMA}`);

    const tables = generate(spec);
    await pipeline(Readable.from(loadSql(spec, tables)), createWriteStream(join(dir, 'load.sql')));
    writeFileSync(join(dir, 'after-analyze.sql'), afterAnalyzeSql(spec));
    psql(['-f', join(dir, 'load.sql')]);
    run(`ANALYZE ${spec.tables.map(({ name }) => quote(name)).join(', ')}`);
    psql(['-f', join(dir, 'after-analyze.sql')]);

    const columns = statsColumns(spec);
    const level = writeLevel(spec, {
      version,
      settings,
      stats: columns.length === 0 ? null : json(statsSql(columns)),
      explain: json(`EXPLAIN (FORMAT JSON) ${levelSql(spec)}`),
      cardinalities: measure(query(spec), (sql) => Number(run(sql))),
    });
    const options = { ...(await resolveConfig(target.level)), filepath: target.level };
    writeFileSync(target.level, await format(JSON.stringify(level), options));
    console.log(
      `author-level: wrote ${target.level} (best ${String(level.costs.best)}, PostgreSQL ${String(level.costs.optimizer)}).`,
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

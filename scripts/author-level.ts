// Authors one level: loads a spec's data into PostgreSQL, measures it and
// writes the level file, formatted by Prettier. It runs psql with the usual
// PG* environment variables, as a superuser (the settings use ALTER SYSTEM),
// and keeps the tables in the schema "authoring", which it drops and
// recreates. It needs a database, so it runs only in CI. The steps are in
// docs/level-spec.md.
import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const [specFile, outFile, ...rest] = process.argv.slice(2);
if (specFile === undefined || outFile === undefined || rest.length > 0) {
  console.error('Usage: npm run author-level -- <spec.yaml> <level.json>');
  process.exit(2);
}

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

/** The settings as SHOW prints them, once the reload has reached new connections. */
function settled(): unknown {
  for (let attempt = 1; ; attempt += 1) {
    const shown = json(showSettingsSql());
    try {
      checkSettings(shown);
      return shown;
    } catch (error) {
      if (attempt === 10) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

const spec = parseSpec(readFileSync(specFile, 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'author-level-'));
try {
  // ALTER SYSTEM cannot run in a transaction, so the script goes through -f,
  // which sends one statement at a time.
  psql(['-f', '-'], applySettingsSql());
  const settings = settled();
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
    version: run('SHOW server_version_num'),
    settings,
    stats: columns.length === 0 ? null : json(statsSql(columns)),
    explain: json(`EXPLAIN (FORMAT JSON) ${levelSql(spec)}`),
    cardinalities: measure(query(spec), (sql) => Number(run(sql))),
  });
  const options = { ...(await resolveConfig(outFile)), filepath: outFile };
  writeFileSync(outFile, await format(JSON.stringify(level), options));
  console.log(
    `author-level: wrote ${outFile} (best ${String(level.costs.best)}, PostgreSQL ${String(level.costs.optimizer)}).`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

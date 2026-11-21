// Generates a level's dataset from its spec and writes it as SQL for psql:
// <out-dir>/load.sql and <out-dir>/after-analyze.sql. The format is in
// docs/level-spec.md.
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { generate } from '../authoring/generate.ts';
import { afterAnalyzeSql, loadSql } from '../authoring/sql.ts';
import { parseSpec } from '../authoring/spec.ts';

const [specFile, outDir, ...rest] = process.argv.slice(2);
if (specFile === undefined || outDir === undefined || rest.length > 0) {
  console.error('Usage: npm run generate-data -- <spec.yaml> <out-dir>');
  process.exit(2);
}

const spec = parseSpec(readFileSync(specFile, 'utf8'));
const tables = generate(spec);
const lines = loadSql(spec, tables);
mkdirSync(outDir, { recursive: true });
await pipeline(Readable.from(lines), createWriteStream(`${outDir}/load.sql`));
writeFileSync(`${outDir}/after-analyze.sql`, afterAnalyzeSql(spec));

const rows = tables.map(({ name, rows }) => `${name} ${String(rows.length)}`).join(', ');
console.log(`generate-data: wrote ${outDir}/load.sql (${rows}) and ${outDir}/after-analyze.sql.`);

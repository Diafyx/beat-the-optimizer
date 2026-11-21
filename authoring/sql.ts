/**
 * Writes a generated dataset as SQL for psql. `load.sql` creates the tables,
 * copies the rows in insert order and then builds the indexes;
 * `after-analyze.sql` holds the statements the spec runs after `ANALYZE`.
 */
import { at, type TableData } from './generate.ts';
import type { Spec, Value } from './spec.ts';

const HEADER = '-- Generated from a level spec by scripts/generate-data.ts. Do not edit.\n';

/** Names match ^[a-z_][a-z0-9_]*$, so quoting needs no escaping; it allows reserved words. */
const quote = (name: string): string => `"${name}"`;

/** A value in COPY's text format: backslash, tab, newline and carriage return escaped. */
export function copyValue(value: Value): string {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('\t', '\\t')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r');
}

/** Throws if a unique index's column has a repeated value, which would fail the load. */
function checkUnique(spec: Spec, tables: readonly TableData[]): void {
  spec.tables.forEach((table, t) => {
    const data = at(tables, t);
    for (const index of table.indexes.filter(({ unique }) => unique === true)) {
      const i = data.columns.indexOf(index.column);
      if (new Set(data.rows.map((row) => row[i])).size < data.rows.length) {
        throw new Error(
          `The unique index ${index.name} is on ${table.name}.${index.column}, which has repeated values`,
        );
      }
    }
  });
}

function* loadLines(spec: Spec, tables: readonly TableData[]): Generator<string> {
  yield HEADER;
  yield "SET client_encoding = 'UTF8';\n";
  for (const [t, table] of spec.tables.entries()) {
    const columns = table.columns.map(({ name }) => quote(name)).join(', ');
    yield `\nCREATE TABLE ${quote(table.name)} (\n`;
    yield table.columns
      .map(({ name, type }) => `  ${quote(name)} ${type} NOT NULL`)
      .join(',\n')
      .concat('\n);\n');
    yield `COPY ${quote(table.name)} (${columns}) FROM stdin;\n`;
    for (const row of at(tables, t).rows) {
      yield `${row.map(copyValue).join('\t')}\n`;
    }
    yield '\\.\n';
    for (const index of table.indexes) {
      const unique = index.unique === true ? 'UNIQUE ' : '';
      yield `CREATE ${unique}INDEX ${quote(index.name)} ON ${quote(table.name)} (${quote(index.column)});\n`;
    }
  }
}

/**
 * The lines of `load.sql` for `tables`, the output of `generate(spec)`. Checks
 * unique indexes first, so a bad spec fails before anything is written.
 */
export function loadSql(spec: Spec, tables: readonly TableData[]): Iterable<string> {
  checkUnique(spec, tables);
  return loadLines(spec, tables);
}

/** `after-analyze.sql`: each statement of the spec, ending in one semicolon. */
export function afterAnalyzeSql(spec: Spec): string {
  return (
    HEADER +
    spec.afterAnalyze.map((statement) => `${statement.trim().replace(/;+$/, '')};\n`).join('')
  );
}

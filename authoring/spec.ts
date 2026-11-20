/**
 * Level specs: the declarative description of a level's dataset, in YAML.
 * The format is in docs/level-spec.md and schema/level-spec.schema.json.
 */
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';

export type Value = string | number;

export type Values =
  | { readonly kind: 'sequence'; readonly start?: number }
  | { readonly kind: 'uniform'; readonly min: number; readonly max: number }
  | {
      readonly kind: 'weighted';
      readonly weights: readonly { readonly value: Value; readonly weight: number }[];
    }
  | { readonly kind: 'dateRange'; readonly from: string; readonly to: string }
  | { readonly kind: 'reference'; readonly table: string; readonly column: string }
  | {
      readonly kind: 'derived';
      readonly column: string;
      readonly map: readonly { readonly from: Value; readonly to: Value }[];
    }
  | { readonly kind: 'label'; readonly prefix: string };

export interface ColumnSpec {
  readonly name: string;
  readonly type: 'integer' | 'bigint' | 'text' | 'date';
  readonly values: Values;
}

export interface IndexSpec {
  readonly name: string;
  readonly column: string;
  readonly unique?: boolean;
}

export interface TableSpec {
  readonly name: string;
  readonly rows: number;
  /** "shuffled", or the column the rows are inserted in ascending order of. */
  readonly order: string;
  readonly columns: readonly ColumnSpec[];
  readonly indexes: readonly IndexSpec[];
}

export interface Spec {
  readonly seed: number;
  readonly tables: readonly TableSpec[];
  readonly afterAnalyze: readonly string[];
}

const schema = JSON.parse(
  readFileSync(new URL('../schema/level-spec.schema.json', import.meta.url), 'utf8'),
) as object;
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

const repeated = (values: readonly string[]): string[] => [
  ...new Set(values.filter((value, i) => values.indexOf(value) !== i)),
];

/** A date string's day number, or NaN if it is not a real calendar date. */
export function dayNumber(date: string): number {
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date
    ? NaN
    : time / 86_400_000;
}

/** What the schema cannot check: names, references and ranges. */
function problems(spec: Spec): string[] {
  const found: string[] = [];
  const tables = spec.tables.map(({ name }) => name);
  for (const name of repeated(tables)) found.push(`The table ${name} is defined more than once`);
  const indexes = spec.tables.flatMap((table) => table.indexes.map(({ name }) => name));
  for (const name of repeated(indexes)) found.push(`The index ${name} is defined more than once`);

  spec.tables.forEach((table, t) => {
    const columns = table.columns.map(({ name }) => name);
    for (const name of repeated(columns)) {
      found.push(`The column ${table.name}.${name} is defined more than once`);
    }
    if (table.order !== 'shuffled' && !columns.includes(table.order)) {
      found.push(`${table.name} is inserted in order of ${table.order}, which is not a column`);
    }
    for (const index of table.indexes.filter(({ column }) => !columns.includes(column))) {
      found.push(`The index ${index.name} is on ${index.column}, which is not a column`);
    }
    table.columns.forEach(({ name, values }, c) => {
      const where = `${table.name}.${name}`;
      if (values.kind === 'uniform' && values.min > values.max) {
        found.push(`${where} has min ${String(values.min)} above max ${String(values.max)}`);
      } else if (values.kind === 'dateRange') {
        const [from, to] = [dayNumber(values.from), dayNumber(values.to)];
        if (Number.isNaN(from) || Number.isNaN(to) || from > to) {
          found.push(`${where} needs two real dates, from ${values.from} to ${values.to}`);
        }
      } else if (values.kind === 'reference') {
        const target = spec.tables.slice(0, t).find(({ name }) => name === values.table);
        if (target?.columns.some((column) => column.name === values.column) !== true) {
          found.push(
            `${where} references ${values.table}.${values.column}, which is not a column of an earlier table`,
          );
        }
      } else if (values.kind === 'derived' && !columns.slice(0, c).includes(values.column)) {
        found.push(`${where} is derived from ${values.column}, which is not an earlier column`);
      }
    });
  });
  return found;
}

/** Parses and checks a level spec; throws with every problem found. */
export function parseSpec(text: string): Spec {
  const data: unknown = parse(text);
  // Ajv sets errors to null when the data is valid.
  validate(data);
  if (validate.errors) {
    throw new Error(
      `Invalid level spec:\n${validate.errors.map(({ instancePath, message }) => `  spec${instancePath} ${String(message)}`).join('\n')}`,
    );
  }
  const spec = data as Spec;
  const found = problems(spec);
  if (found.length > 0) {
    throw new Error(`Invalid level spec:\n${found.map((problem) => `  ${problem}`).join('\n')}`);
  }
  return spec;
}

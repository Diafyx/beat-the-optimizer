/**
 * Level specs: the declarative description of a level's dataset and the
 * puzzle around it, in YAML.
 * The format is in docs/level-spec.md and schema/level-spec.schema.json.
 */
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import type { ColumnRef, JoinPredicate, Lock } from '../src/engine/level.ts';
import { connectedSets } from '../src/engine/validate.ts';

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

/** A predicate on one column of a table. */
export type Filter =
  | {
      readonly column: string;
      readonly op: '=' | '<' | '<=' | '>' | '>=';
      readonly value: Value;
    }
  | { readonly column: string; readonly op: 'in'; readonly values: readonly Value[] };

/** The puzzle around the dataset: its text, and the parts of its query. */
export interface LevelSpec {
  readonly id: string;
  readonly title: string;
  readonly story: readonly string[];
  readonly select: readonly ColumnRef[];
  readonly filters: readonly (Filter & { readonly table: string })[];
  readonly joins: readonly JoinPredicate[];
  readonly orderBy: ColumnRef | null;
  readonly locks: readonly Lock[];
  /** The columns whose statistics the player is shown. */
  readonly stats: readonly ColumnRef[];
  readonly explanation: readonly string[];
}

/** The part of a spec that the data is generated from. */
export interface Dataset {
  readonly seed: number;
  readonly tables: readonly TableSpec[];
  readonly afterAnalyze: readonly string[];
}

export interface Spec extends Dataset {
  readonly level: LevelSpec;
}

const schema = (name: string): object =>
  JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), 'utf8')) as object;
// The spec schema refers to the level schema's definitions.
const validate = new Ajv2020({ strict: true, allErrors: true })
  .addSchema(schema('level.schema.json'))
  .compile(schema('level-spec.schema.json'));

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

const KINDS = { integer: 'an integer', bigint: 'an integer', text: 'a string', date: 'a date' };

/** Whether `value` can be compared with a column of `type`. */
const fits = (type: ColumnSpec['type'], value: Value): boolean =>
  type === 'integer' || type === 'bigint'
    ? typeof value === 'number'
    : typeof value === 'string' && (type === 'text' || !Number.isNaN(dayNumber(value)));

/** What the schema cannot check in the level section: references and the join tree. */
function levelProblems({ tables, level }: Spec): string[] {
  const found: string[] = [];
  const table = (name: string) => tables.find((candidate) => candidate.name === name);
  const column = (where: string, { table: name, column: wanted }: ColumnRef) => {
    const match = table(name)?.columns.find((candidate) => candidate.name === wanted);
    if (match === undefined) found.push(`${where} names ${name}.${wanted}, which is not a column`);
    return match;
  };
  for (const ref of level.select) column('select', ref);
  for (const filter of level.filters) {
    const type = column('A filter', filter)?.type;
    if (type === undefined) continue;
    for (const value of filter.op === 'in' ? filter.values : [filter.value]) {
      if (!fits(type, value)) {
        found.push(
          `The filter on ${filter.table}.${filter.column} compares it with ${JSON.stringify(value)}, which is not ${KINDS[type]}`,
        );
      }
    }
  }
  for (const { left, right } of level.joins) {
    const where = `The join ${left.table}.${left.column} = ${right.table}.${right.column}`;
    column(where, left);
    column(where, right);
  }
  if (level.orderBy !== null) column('orderBy', level.orderBy);
  for (const ref of level.stats) column('stats', ref);
  for (const lock of level.locks) {
    if (lock.kind === 'joinOrder') {
      for (const name of lock.tables.filter((name) => table(name) === undefined)) {
        found.push(`A join order lock names ${name}, which is not a table`);
      }
    } else if (lock.kind === 'access') {
      const { scan } = lock;
      const target = table(scan.table);
      if (target === undefined) {
        found.push(`An access lock scans ${scan.table}, which is not a table`);
      } else if (
        scan.access === 'index' &&
        !target.indexes.some(({ name }) => name === scan.index)
      ) {
        found.push(
          `An access lock scans ${scan.table} through ${scan.index}, which is not an index on ${scan.table}`,
        );
      }
    }
  }
  const all = connectedSets({ tables, joins: level.joins }).some(
    (set) => set.length === tables.length,
  );
  if (!all || level.joins.length !== tables.length - 1) {
    found.push('The joins must connect every table as a tree, with one join fewer than tables');
  }
  return found;
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
  return [...found, ...levelProblems(spec)];
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

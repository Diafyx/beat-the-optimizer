/**
 * Generates a level's dataset from its spec. The same spec always gives the
 * same rows in the same order: each column and each table's insert order has
 * its own random stream, named after it, so editing one column does not
 * change the others.
 */
import { Random } from './random.ts';
import { dayNumber, type Dataset, type TableSpec, type Value, type Values } from './spec.ts';

export interface TableData {
  readonly name: string;
  readonly columns: readonly string[];
  /** The rows in insert order, one value per column. */
  readonly rows: readonly (readonly Value[])[];
}

const DAY = 86_400_000;

/** `items[i]`, or a RangeError if there is nothing there. */
export function at<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) {
    throw new RangeError(`Nothing at index ${String(i)} of ${String(items.length)}`);
  }
  return item;
}

/**
 * How many of `rows` get each value: its share of the total weight, rounded
 * down, then one more for the largest remainders (the earlier value on a tie).
 */
export function exactCounts(
  weights: readonly { readonly value: Value; readonly weight: number }[],
  rows: number,
): { value: Value; count: number }[] {
  const total = weights.reduce((sum, { weight }) => sum + weight, 0);
  const shares = weights.map(({ weight }) => (weight * rows) / total);
  const floors = shares.map((share) => Math.floor(share));
  const left = rows - floors.reduce((sum, count) => sum + count, 0);
  const extra = new Set(
    shares
      .map((share, i) => ({ i, remainder: share - Math.floor(share) }))
      .sort((x, y) => y.remainder - x.remainder || x.i - y.i)
      .slice(0, left)
      .map(({ i }) => i),
  );
  return weights.map(({ value }, i) => ({
    value,
    count: at(floors, i) + (extra.has(i) ? 1 : 0),
  }));
}

/** The value of `key` in `map`, or an error with `problem` if it has none. */
function found(map: ReadonlyMap<Value, Value>, key: Value, problem: () => string): Value {
  const value = map.get(key);
  if (value === undefined) throw new Error(problem());
  return value;
}

const isoDate = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10);

const compare = (x: Value, y: Value): number => (x < y ? -1 : x > y ? 1 : 0);

class Generator {
  /** Generated columns, by "table.column", in generation order. */
  private readonly done = new Map<string, readonly Value[]>();
  /** For each reference column, the row of the referenced table each of its rows picked. */
  private readonly picked = new Map<string, readonly number[]>();
  private readonly spec: Dataset;

  constructor(spec: Dataset) {
    this.spec = spec;
  }

  generated(table: string, column: string): readonly Value[] {
    const values = this.done.get(`${table}.${column}`);
    if (values === undefined) {
      throw new Error(`${table}.${column} has not been generated yet`);
    }
    return values;
  }

  table(table: TableSpec): TableData {
    const columns = table.columns.map(({ name, values }) => {
      const generated = this.column(table, name, values);
      this.done.set(`${table.name}.${name}`, generated);
      return generated;
    });
    const positions = Array.from({ length: table.rows }, (_, i) => i);
    let order: number[];
    if (table.order === 'shuffled') {
      order = Random.for(this.spec.seed, `${table.name}#order`).shuffle(positions);
    } else {
      // Stable, so equal keys keep their generation order.
      const key = this.generated(table.name, table.order);
      order = positions.sort((x, y) => compare(at(key, x), at(key, y)));
    }
    return {
      name: table.name,
      columns: table.columns.map(({ name }) => name),
      rows: order.map((row) => columns.map((column) => at(column, row))),
    };
  }

  private column(table: TableSpec, name: string, values: Values): Value[] {
    const random = Random.for(this.spec.seed, `${table.name}.${name}`);
    const rows = Array.from({ length: table.rows }, (_, i) => i);
    switch (values.kind) {
      case 'sequence': {
        const start = values.start ?? 1;
        return rows.map((i) => start + i);
      }
      case 'uniform':
        return rows.map(() => random.int(values.min, values.max));
      case 'weighted':
        return random.shuffle(
          exactCounts(values.weights, table.rows).flatMap(({ value, count }) =>
            Array.from({ length: count }, () => value),
          ),
        );
      case 'dateRange': {
        const [from, to] = [dayNumber(values.from), dayNumber(values.to)];
        return rows.map(() => isoDate(random.int(from, to)));
      }
      case 'reference': {
        const target = this.generated(values.table, values.column);
        const picked = rows.map(() => random.int(0, target.length - 1));
        this.picked.set(`${table.name}.${name}`, picked);
        return picked.map((row) => at(target, row));
      }
      case 'derived': {
        const map = new Map(values.map.map(({ from, to }) => [from, to]));
        return this.generated(table.name, values.column).map((value) =>
          found(
            map,
            value,
            () =>
              `${table.name}.${name} has no mapping for the ${values.column} value ${JSON.stringify(value)}`,
          ),
        );
      }
      case 'follows': {
        const link = table.columns.find((column) => column.name === values.through)?.values;
        const picked = this.picked.get(`${table.name}.${values.through}`);
        if (link?.kind !== 'reference' || picked === undefined) {
          throw new Error(
            `${table.name}.${name} follows through ${values.through}, which is not an earlier reference column`,
          );
        }
        const keys = this.generated(link.table, link.column);
        if (new Set(keys).size !== keys.length) {
          throw new Error(
            `${table.name}.${name} follows through ${values.through}, but ${link.table}.${link.column} has repeated values, so a ${values.through} does not reference one row`,
          );
        }
        const targets = this.generated(link.table, values.column);
        const map = new Map(values.map.map(({ from, to }) => [from, to]));
        return picked.map((row) => {
          const target = at(targets, row);
          return found(
            map,
            target,
            () =>
              `${table.name}.${name} has no mapping for the ${link.table}.${values.column} value ${JSON.stringify(target)}`,
          );
        });
      }
      case 'label':
        return rows.map((i) => `${values.prefix}${String(i + 1)}`);
    }
  }
}

/** Every table of `spec`, generated in spec order. The spec must be valid. */
export function generate(spec: Dataset): TableData[] {
  const generator = new Generator(spec);
  return spec.tables.map((table) => generator.table(table));
}

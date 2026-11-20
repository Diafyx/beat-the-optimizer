/**
 * Level validation: the rules in docs/level-format.md that the JSON Schema
 * cannot express. The level must already match the schema.
 */
import { joinPredicate } from './cost.ts';
import type { ColumnRef, Level, Plan, Scan, Table } from './level.ts';

export interface LevelError {
  /** The rule's number in docs/level-format.md. */
  readonly rule: number;
  readonly message: string;
}

const key = (ref: ColumnRef): string => `${ref.table}.${ref.column}`;
const setKey = (tables: readonly string[]): string => [...tables].sort().join(', ');

/** The values that appear more than once, each once. */
function repeated(values: readonly string[]): string[] {
  return [...new Set(values.filter((value, i) => values.indexOf(value) !== i))];
}

/** Every subset of `names`. The empty set yields no cardinality. */
function subsets(names: readonly string[]): string[][] {
  const all: string[][] = [[]];
  for (const name of names) {
    for (const subset of [...all]) {
      all.push([...subset, name]);
    }
  }
  return all;
}

/** Whether the level's predicates between `names` connect all of them. */
function connected(level: Level, names: readonly string[]): boolean {
  const reached = new Set(names.slice(0, 1));
  let grew = true;
  while (grew) {
    grew = false;
    for (const { left, right } of level.joins) {
      if (
        names.includes(left.table) &&
        names.includes(right.table) &&
        reached.has(left.table) !== reached.has(right.table)
      ) {
        reached.add(left.table);
        reached.add(right.table);
        grew = true;
      }
    }
  }
  return names.every((name) => reached.has(name));
}

class Validator {
  readonly errors: LevelError[] = [];
  private readonly level: Level;

  constructor(level: Level) {
    this.level = level;
  }

  add(rule: number, message: string): void {
    this.errors.push({ rule, message });
  }

  table(name: string): Table | undefined {
    return this.level.tables.find((table) => table.name === name);
  }

  /** Rule 1: names are unique. */
  names(): void {
    for (const name of repeated(this.level.tables.map((table) => table.name))) {
      this.add(1, `The table ${name} is defined more than once`);
    }
    for (const table of this.level.tables) {
      for (const name of repeated(table.columns.map((column) => column.name))) {
        this.add(1, `The column ${table.name}.${name} is defined more than once`);
      }
    }
    const indexes = this.level.tables.flatMap((table) => table.indexes.map(({ name }) => name));
    for (const name of repeated(indexes)) {
      this.add(1, `The index ${name} is defined more than once`);
    }
  }

  /** Rule 2: references resolve. Cardinalities are rule 4 and plans rule 5. */
  references(): void {
    const column = (where: string, ref: ColumnRef): void => {
      if (this.table(ref.table)?.columns.some(({ name }) => name === ref.column) !== true) {
        this.add(2, `${where} names ${key(ref)}, which is not a column`);
      }
    };
    for (const table of this.level.tables) {
      if (table.storedOrder !== null) {
        column(`The stored order of ${table.name}`, {
          table: table.name,
          column: table.storedOrder,
        });
      }
      for (const index of table.indexes) {
        column(`The index ${index.name}`, { table: table.name, column: index.column });
      }
    }
    for (const { left, right } of this.level.joins) {
      column(`The join predicate ${key(left)} = ${key(right)}`, left);
      column(`The join predicate ${key(left)} = ${key(right)}`, right);
    }
    if (this.level.orderBy !== null) {
      column('ORDER BY', this.level.orderBy);
    }
    for (const lock of this.level.locks) {
      if (lock.kind === 'joinOrder') {
        for (const name of lock.tables.filter((table) => this.table(table) === undefined)) {
          this.add(2, `A join order lock names ${name}, which is not a table`);
        }
      } else if (lock.kind === 'access') {
        const error = this.scanError(lock.scan);
        if (error !== undefined) {
          this.add(2, `An access lock ${error}`);
        }
      }
    }
  }

  /** Why `scan` does not resolve, or undefined if it does. */
  scanError(scan: Scan): string | undefined {
    const table = this.table(scan.table);
    if (table === undefined) {
      return `scans ${scan.table}, which is not a table`;
    }
    if (scan.access === 'index' && !table.indexes.some(({ name }) => name === scan.index)) {
      return `scans ${scan.table} through ${scan.index}, which is not an index on ${scan.table}`;
    }
    return undefined;
  }

  /** Rule 3: the predicates form a tree over the tables. */
  tree(): void {
    const { tables, joins } = this.level;
    for (const { left, right } of joins.filter(({ left, right }) => left.table === right.table)) {
      this.add(3, `The join predicate ${key(left)} = ${key(right)} joins a table to itself`);
    }
    if (joins.length !== tables.length - 1) {
      this.add(
        3,
        `The level has ${String(tables.length)} tables and ${String(joins.length)} join predicates; a tree has one fewer predicate than tables`,
      );
    }
    if (
      !connected(
        this.level,
        tables.map(({ name }) => name),
      )
    ) {
      this.add(3, 'The join predicates do not connect every table');
    }
  }

  /** Rule 4: every cardinality the cost model needs, once, and no others. */
  cardinalities(): void {
    const { tables, cardinalities } = this.level;
    const sets = subsets(tables.map(({ name }) => name)).filter((set) =>
      connected(this.level, set),
    );
    const lookups = sets.flatMap((outer) =>
      tables.flatMap((table) => {
        const predicate = outer.includes(table.name)
          ? undefined
          : joinPredicate(this.level, outer, table.name);
        return table.indexes
          .filter((index) => index.column === predicate?.[1].column)
          .map((index) => `${index.name} after ${setKey(outer)}`);
      }),
    );
    this.entries(
      'scans',
      tables.map(({ name }) => name),
      cardinalities.scans.map(({ table }) => table),
    );
    this.entries(
      'scans',
      tables.flatMap((table) => table.indexes.map((index) => `${table.name} index ${index.name}`)),
      cardinalities.scans.flatMap(({ table, indexes }) =>
        indexes.map(({ index }) => `${table} index ${index}`),
      ),
    );
    this.entries(
      'joins',
      sets.filter((set) => set.length > 1).map(setKey),
      cardinalities.joins.map(({ tables: set }) => setKey(set)),
    );
    this.entries(
      'lookups',
      lookups,
      cardinalities.lookups.map(({ outer, index }) => `${index} after ${setKey(outer)}`),
    );
  }

  private entries(field: string, expected: readonly string[], actual: readonly string[]): void {
    for (const entry of expected.filter((entry) => !actual.includes(entry))) {
      this.add(4, `cardinalities.${field} is missing ${entry}`);
    }
    for (const entry of actual.filter((entry) => !expected.includes(entry))) {
      this.add(4, `cardinalities.${field} has an unexpected entry ${entry}`);
    }
    for (const entry of repeated(actual)) {
      this.add(4, `cardinalities.${field} lists ${entry} more than once`);
    }
  }

  /** Rule 5: a plan reads every table once, each joined by a predicate. */
  plan(where: string, plan: Plan): void {
    const fail = (message: string): void => {
      this.add(5, `${where} ${message}`);
    };
    const scan = (scanned: Scan): void => {
      const error = this.scanError(scanned);
      if (error !== undefined) {
        fail(error);
      }
    };
    scan(plan.first);
    const joined = [plan.first.table];
    for (const step of plan.steps) {
      const table = step.join === 'indexNestedLoop' ? step.table : step.scan.table;
      if (joined.includes(table)) {
        fail(`joins ${table} twice`);
        continue;
      }
      const predicate = joinPredicate(this.level, joined, table);
      if (predicate === undefined) {
        fail(`joins ${table} without a join predicate to ${joined.join(', ')}`);
      }
      if (step.join !== 'indexNestedLoop') {
        scan(step.scan);
      } else {
        const index = this.table(table)?.indexes.find(({ name }) => name === step.index);
        if (index === undefined) {
          fail(`looks up ${table} through ${step.index}, which is not an index on ${table}`);
        } else if (predicate !== undefined && index.column !== predicate[1].column) {
          fail(
            `looks up ${table} through ${index.name}, which is on ${table}.${index.column}, not on the join column ${key(predicate[1])}`,
          );
        }
      }
      joined.push(table);
    }
    for (const { name } of this.level.tables.filter(({ name }) => !joined.includes(name))) {
      fail(`does not read ${name}`);
    }
  }
}

/**
 * Every structural rule of docs/level-format.md (rules 1 to 5) that `level`
 * breaks, in rule order; empty if it keeps them all.
 */
export function validateLevel(level: Level): LevelError[] {
  const validator = new Validator(level);
  validator.names();
  validator.references();
  validator.tree();
  validator.cardinalities();
  validator.plan('optimizer.plan', level.optimizer.plan);
  validator.plan('costs.bestPlan', level.costs.bestPlan);
  return validator.errors;
}

/**
 * Maps PostgreSQL's `EXPLAIN (FORMAT JSON)` output into the game's plan space
 * (docs/level-format.md, Plans), and summarises it for `optimizer.explain`.
 * Anything the plan space cannot express fails with a message naming it.
 */
import type { ExplainNode, Plan, Scan, Step } from '../src/engine/level.ts';
import { at } from './generate.ts';

/** One node of EXPLAIN (FORMAT JSON) output, with the fields the mapper reads. */
interface PgNode {
  readonly type: string;
  readonly relation: string | null;
  readonly alias: string | null;
  readonly index: string | null;
  readonly indexCond: string | null;
  readonly rows: number;
  readonly cost: number;
  readonly children: readonly PgNode[];
}

/** A left-deep plan so far, with the aliases of its tables. */
interface Part {
  readonly first: Scan;
  /** The first scan's index condition, which shows whether it is parameterised. */
  readonly cond: string | null;
  readonly steps: readonly Step[];
  readonly aliases: readonly string[];
}

type Json = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function text(node: Json, key: string): string | null {
  const value = node[key];
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`The EXPLAIN field "${key}" is not a string`);
  }
  return value ?? null;
}

function number(node: Json, key: string): number {
  const value = node[key];
  if (typeof value !== 'number') throw new Error(`The EXPLAIN field "${key}" is not a number`);
  return value;
}

function readNode(raw: unknown): PgNode {
  if (!isObject(raw)) throw new Error('An EXPLAIN node is not an object');
  const plans = raw['Plans'] ?? [];
  if (!Array.isArray(plans)) throw new Error('The EXPLAIN field "Plans" is not an array');
  return {
    type: required(text(raw, 'Node Type'), 'An EXPLAIN node', 'Node Type'),
    relation: text(raw, 'Relation Name'),
    alias: text(raw, 'Alias'),
    index: text(raw, 'Index Name'),
    indexCond: text(raw, 'Index Cond'),
    rows: number(raw, 'Plan Rows'),
    cost: number(raw, 'Total Cost'),
    children: plans.map(readNode),
  };
}

function required(value: string | null, what: string, field: string): string {
  if (value === null) throw new Error(`${what} has no "${field}"`);
  return value;
}

function inputs(node: PgNode, count: number): readonly PgNode[] {
  if (node.children.length !== count) {
    throw new Error(
      `${node.type} has ${String(node.children.length)} inputs, expected ${String(count)}`,
    );
  }
  return node.children;
}

const single = (node: PgNode): PgNode => at(inputs(node, 1), 0);

/** The outer and inner inputs of a join, as plans so far. */
function pair(node: PgNode): [Part, Part] {
  const children = inputs(node, 2);
  return [part(at(children, 0)), part(at(children, 1))];
}

function unsupported(node: PgNode): never {
  switch (node.type) {
    case 'BitmapAnd':
    case 'BitmapOr':
      throw new Error(`${node.type} combines several indexes, which the plan space does not have`);
    case 'Gather':
    case 'Gather Merge':
      throw new Error(`${node.type} runs workers in parallel, which the plan space does not have`);
    default:
      throw new Error(`Unknown EXPLAIN node type ${node.type}`);
  }
}

/** The Bitmap Index Scan under a Bitmap Heap Scan. */
function bitmapIndex(node: PgNode): PgNode {
  const child = single(node);
  return child.type === 'Bitmap Index Scan' ? child : unsupported(child);
}

function scan(node: PgNode): Part {
  const table = required(node.relation, node.type, 'Relation Name');
  const aliases = [required(node.alias, node.type, 'Alias')];
  if (node.type === 'Seq Scan') {
    return { first: { table, access: 'seq' }, cond: null, steps: [], aliases };
  }
  const indexNode = node.type === 'Bitmap Heap Scan' ? bitmapIndex(node) : node;
  const index = required(indexNode.index, indexNode.type, 'Index Name');
  return {
    first: { table, access: 'index', index },
    cond: indexNode.indexCond,
    steps: [],
    aliases,
  };
}

/** Whether `cond` names a column of one of `aliases`, outside string literals. */
function references(cond: string | null, aliases: readonly string[]): boolean {
  const code = (cond ?? '').replace(/'(?:[^']|'')*'/g, "''");
  return aliases.some((alias) => new RegExp(`(^|[^\\w."])${alias}\\.`).test(code));
}

const append = (left: Part, right: Part, step: Step): Part => ({
  ...left,
  steps: [...left.steps, step],
  aliases: [...left.aliases, ...right.aliases],
});

function part(node: PgNode): Part {
  switch (node.type) {
    case 'Seq Scan':
    case 'Index Scan':
    case 'Index Only Scan':
    case 'Bitmap Heap Scan':
      return scan(node);
    // Hash, Materialize and Memoize belong to their join; sorts are added by
    // the cost model where they are needed.
    case 'Hash':
    case 'Materialize':
    case 'Memoize':
    case 'Sort':
    case 'Incremental Sort':
      return part(single(node));
    case 'Hash Join':
    case 'Merge Join': {
      const [outer, inner] = pair(node);
      // Both are symmetric in the cost model, so the joined side is the left.
      const [left, right] = inner.steps.length === 0 ? [outer, inner] : [inner, outer];
      if (right.steps.length > 0) {
        throw new Error(`Both inputs of ${node.type} are joins, so the plan is not left-deep`);
      }
      return append(left, right, {
        join: node.type === 'Hash Join' ? 'hash' : 'merge',
        scan: right.first,
      });
    }
    case 'Nested Loop': {
      const [outer, inner] = pair(node);
      if (inner.steps.length > 0) {
        throw new Error('The inner input of Nested Loop is a join, so the plan is not left-deep');
      }
      const { first } = inner;
      return append(
        outer,
        inner,
        first.access === 'index' && references(inner.cond, outer.aliases)
          ? { join: 'indexNestedLoop', table: first.table, index: first.index }
          : { join: 'nestedLoop', scan: first },
      );
    }
    default:
      return unsupported(node);
  }
}

const summary = (node: PgNode): ExplainNode => ({
  nodeType: node.type,
  relation: node.relation,
  index: node.index,
  estimatedRows: node.rows,
  estimatedCost: node.cost,
  children: node.children.map(summary),
});

/**
 * PostgreSQL's plan from `output`, the parsed output of
 * `EXPLAIN (FORMAT JSON)`, as a plan in the plan space and an EXPLAIN summary.
 */
export function mapExplain(output: unknown): { plan: Plan; explain: ExplainNode } {
  const root: unknown = Array.isArray(output) && output.length === 1 ? output[0] : undefined;
  if (!isObject(root)) throw new Error('EXPLAIN output must be one plan, in FORMAT JSON');
  const node = readNode(root['Plan']);
  const { first, steps } = part(node);
  return { plan: { first, steps }, explain: summary(node) };
}

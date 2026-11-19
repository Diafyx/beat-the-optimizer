/**
 * Types for a level file, matching schema/level.schema.json (format 1).
 * docs/level-format.md explains each field.
 */

export interface ColumnRef {
  readonly table: string;
  readonly column: string;
}

export type Scalar = string | number | boolean;

export interface ColumnStats {
  readonly nullFraction: number;
  readonly distinct: number;
  readonly mostCommon: readonly { readonly value: Scalar; readonly frequency: number }[];
  readonly histogram: readonly Scalar[];
  readonly correlation: number | null;
}

export interface Column {
  readonly name: string;
  readonly type: string;
  readonly stats: ColumnStats | null;
}

export interface Index {
  readonly name: string;
  readonly column: string;
}

export interface Table {
  readonly name: string;
  readonly rows: number;
  readonly filter: string | null;
  readonly storedOrder: string | null;
  readonly columns: readonly Column[];
  readonly indexes: readonly Index[];
}

/** An equality join predicate: left.column = right.column. */
export interface JoinPredicate {
  readonly left: ColumnRef;
  readonly right: ColumnRef;
}

export type Scan =
  | { readonly table: string; readonly access: 'seq' }
  | { readonly table: string; readonly access: 'index'; readonly index: string };

export type JoinMethod = 'hash' | 'nestedLoop' | 'merge' | 'indexNestedLoop';

/** Joins the next table to the result so far. */
export type Step =
  | { readonly join: 'hash' | 'nestedLoop' | 'merge'; readonly scan: Scan }
  | { readonly join: 'indexNestedLoop'; readonly table: string; readonly index: string };

/** A left-deep plan: scan the first table, then join one table per step. */
export interface Plan {
  readonly first: Scan;
  readonly steps: readonly Step[];
}

export type Lock =
  | { readonly kind: 'joinOrder'; readonly tables: readonly string[] }
  | { readonly kind: 'joinMethod'; readonly method: JoinMethod }
  | { readonly kind: 'access'; readonly scan: Scan };

export interface ScanCardinality {
  readonly table: string;
  readonly filtered: number;
  readonly indexes: readonly { readonly index: string; readonly matched: number }[];
}

export interface JoinCardinality {
  readonly tables: readonly string[];
  readonly rows: number;
}

export interface LookupCardinality {
  readonly outer: readonly string[];
  readonly index: string;
  readonly fetched: number;
}

export interface Cardinalities {
  readonly scans: readonly ScanCardinality[];
  readonly joins: readonly JoinCardinality[];
  readonly lookups: readonly LookupCardinality[];
}

export interface ExplainNode {
  readonly nodeType: string;
  readonly relation: string | null;
  readonly index: string | null;
  readonly estimatedRows: number;
  readonly estimatedCost: number;
  readonly children: readonly ExplainNode[];
}

export interface Optimizer {
  readonly postgres: string;
  readonly settings: Readonly<Record<string, string>>;
  readonly plan: Plan;
  readonly explain: ExplainNode;
}

export interface Costs {
  readonly best: number;
  readonly optimizer: number;
  readonly bestPlan: Plan;
}

export interface Level {
  readonly format: 1;
  readonly id: string;
  readonly title: string;
  readonly story: readonly string[];
  readonly sql: string;
  readonly tables: readonly Table[];
  readonly joins: readonly JoinPredicate[];
  readonly orderBy: ColumnRef | null;
  readonly locks: readonly Lock[];
  readonly cardinalities: Cardinalities;
  readonly optimizer: Optimizer;
  readonly costs: Costs;
  readonly explanation: readonly string[];
}

/**
 * The engine's public API. Code outside src/engine imports only this module
 * (eslint.config.js enforces it), so the engine's internals can change freely.
 */
export type {
  Cardinalities,
  Column,
  ColumnRef,
  ColumnStats,
  ExplainNode,
  Index,
  JoinMethod,
  JoinPredicate,
  Level,
  Lock,
  Plan,
  Scalar,
  Scan,
  Step,
  Table,
} from './level.ts';
export { planCost, type Operator, type PlanCost } from './cost.ts';
export { allowedByLocks, bestPlan, enumeratePlans, joinOrder, type BestPlan } from './plans.ts';
export { validateLevel, type LevelError } from './validate.ts';

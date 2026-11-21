/**
 * The plan builder's questions, derived from the level's plan space so that
 * the player can build every plan in it and no other. A plan is a sequence
 * of answers: the first table and how it is read, then for each join the
 * next table, the join method and, unless it is an index nested loop, how
 * that table is read. Each question offers the answers some plan in the
 * space has after the answers so far; one that only plans the locks forbid
 * have is offered but disabled.
 */
import {
  allowedByLocks,
  enumeratePlans,
  type Level,
  type Plan,
  type Scan,
} from '../engine/index.ts';

export type QuestionKind = 'start' | 'access' | 'next' | 'method';

/** A question: its kind, a key unique in a plan, its table and how many joins come before it. */
interface Slot {
  readonly kind: QuestionKind;
  /** Such as `start`, `access:orders`, `next:1` or `method:orders`. */
  readonly key: string;
  /** The table read or joined; for `start` and `next`, the table picked. */
  readonly table: string;
  readonly step: number;
}

/**
 * One answer of a plan. The value is a table for `start` and `next`, `seq` or
 * `index:<name>` for `access`, and `hash`, `nestedLoop`, `merge` or
 * `indexNestedLoop:<name>` for `method`.
 */
interface Answer extends Slot {
  readonly value: string;
}

export interface Option {
  readonly value: string;
  /** False if only plans that the level's locks forbid have this answer. */
  readonly enabled: boolean;
}

export interface Question extends Slot {
  readonly options: readonly Option[];
  /** The chosen value, or null if the question is still open. */
  readonly answer: string | null;
}

export interface Choices {
  /** The questions answered so far, then the first open one, if any. */
  readonly questions: readonly Question[];
  /** The plan, once every question is answered. */
  readonly plan: Plan | null;
}

const accessValue = (scan: Scan): string => (scan.access === 'seq' ? 'seq' : `index:${scan.index}`);

const access = (scan: Scan, step: number): Answer => ({
  kind: 'access',
  key: `access:${scan.table}`,
  table: scan.table,
  step,
  value: accessValue(scan),
});

/** A plan as its sequence of answers. */
function answers(plan: Plan): Answer[] {
  return [
    { kind: 'start', key: 'start', table: plan.first.table, step: 0, value: plan.first.table },
    access(plan.first, 0),
    ...plan.steps.flatMap((step, i): Answer[] => {
      const table = step.join === 'indexNestedLoop' ? step.table : step.scan.table;
      return [
        { kind: 'next', key: `next:${String(i + 1)}`, table, step: i + 1, value: table },
        {
          kind: 'method',
          key: `method:${table}`,
          table,
          step: i + 1,
          value: step.join === 'indexNestedLoop' ? `indexNestedLoop:${step.index}` : step.join,
        },
        ...(step.join === 'indexNestedLoop' ? [] : [access(step.scan, i + 1)]),
      ];
    }),
  ];
}

interface Candidate {
  readonly plan: Plan;
  readonly answers: readonly Answer[];
  readonly allowed: boolean;
}

/** Every plan in the level's plan space with its answers, in enumeration order. */
export function candidates(level: Level): Candidate[] {
  return enumeratePlans(level).map((plan) => ({
    plan,
    answers: answers(plan),
    allowed: allowedByLocks(level, plan),
  }));
}

/**
 * The questions after `chosen`, the player's answers by question key. An
 * answer that no longer fits is ignored, and a question with a single
 * enabled option answers itself.
 */
export function choices(
  level: Level,
  chosen: ReadonlyMap<string, string>,
  all: readonly Candidate[] = candidates(level),
): Choices {
  const questions: Question[] = [];
  // The plans whose answers so far are the chosen ones, locked or not. All
  // of them have the same kind of question next, or are all complete.
  let left = all;
  for (let k = 0; ; k += 1) {
    const valueAt = (candidate: Candidate): string | undefined => candidate.answers[k]?.value;
    const [first] = left;
    const slot = first?.answers[k];
    if (first === undefined || slot === undefined) {
      return { questions, plan: first?.plan ?? null };
    }
    const options = [...new Set(left.map(valueAt))].map((value) => ({
      value: String(value),
      enabled: left.some((candidate) => candidate.allowed && valueAt(candidate) === value),
    }));
    const enabled = options.filter((option) => option.enabled).map(({ value }) => value);
    const wanted = chosen.get(slot.key);
    const answer =
      wanted !== undefined && enabled.includes(wanted)
        ? wanted
        : enabled.length === 1
          ? String(enabled[0])
          : null;
    const { kind, key, table, step } = slot;
    questions.push({ kind, key, table, step, options, answer });
    if (answer === null) return { questions, plan: null };
    left = left.filter((candidate) => valueAt(candidate) === answer);
  }
}

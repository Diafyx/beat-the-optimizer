/**
 * The plan builder: one group of radio buttons per question, so a plan is
 * built by taps, or by Tab and the arrow keys. Choices the level's locks rule
 * out are shown but disabled.
 */
import type { Level, Plan, Scan, Step } from '../engine/index.ts';
import { el, type Child } from './dom.ts';
import { candidates, choices, type Question } from './plan-choices.ts';

const code = (text: string): HTMLElement => el('code', {}, text);

type ScanJoin = 'hash' | 'nestedLoop' | 'merge';

const METHODS: Readonly<Record<ScanJoin, string>> = {
  hash: 'Hash join',
  nestedLoop: 'Nested loop',
  merge: 'Merge join',
};

function legend({ kind, table, step }: Question): Child[] {
  switch (kind) {
    case 'start':
      return ['Which table do you read first?'];
    case 'next':
      return [step === 1 ? 'Which table do you join to it?' : 'Which table do you join next?'];
    case 'access':
      return ['How do you read ', code(table), '?'];
    case 'method':
      return ['How do you join ', code(table), '?'];
  }
}

function optionLabel(level: Level, { kind, table }: Question, value: string): Child[] {
  const [prefix, index = ''] = value.split(':');
  if (kind === 'start' || kind === 'next') return [code(value)];
  if (prefix === 'seq') return ['Seq scan'];
  if (prefix === 'index') {
    const column = level.tables
      .find(({ name }) => name === table)
      ?.indexes.find(({ name }) => name === index)?.column;
    return ['Index scan on ', code(index), ` (${String(column)})`];
  }
  if (prefix === 'indexNestedLoop') return ['Index nested loop through ', code(index)];
  return [METHODS[value as ScanJoin]];
}

const reading = (scan: Scan): Child[] =>
  scan.access === 'seq' ? [' with a seq scan'] : [' through ', code(scan.index)];

const describeStep = (step: Step): Child[] =>
  step.join === 'indexNestedLoop'
    ? ['Join ', code(step.table), ' with an index nested loop through ', code(step.index), '.']
    : [
        ...[
          'Join ',
          code(step.scan.table),
          ` with a ${METHODS[step.join].toLowerCase()}, reading it`,
        ],
        ...reading(step.scan),
        '.',
      ];

function summary(plan: Plan | null): HTMLElement {
  if (plan === null) return el('p', {}, 'Answer the questions above to finish your plan.');
  return el(
    'ol',
    {},
    el('li', {}, 'Read ', code(plan.first.table), ...reading(plan.first), '.'),
    ...plan.steps.map((step) => el('li', {}, ...describeStep(step))),
  );
}

function fieldset(level: Level, question: Question): HTMLElement {
  return el(
    'fieldset',
    {},
    el('legend', {}, ...legend(question)),
    ...question.options.map(({ value, enabled }) => {
      const input = el('input', { type: 'radio', name: question.key, value });
      input.checked = value === question.answer;
      input.disabled = !enabled;
      return el(
        'label',
        { class: 'option' },
        input,
        el('span', {}, ...optionLabel(level, question, value)),
        ...(enabled ? [] : [el('span', { class: 'locked' }, 'Locked by this level')]),
      );
    }),
  );
}

/**
 * The builder for `level`. `onChange` gets the plan each time an answer
 * changes, or null while a question is open.
 */
export function renderPlanBuilder(
  level: Level,
  onChange: (plan: Plan | null) => void = () => undefined,
): HTMLElement {
  const all = candidates(level);
  const chosen = new Map<string, string>();
  const questions = el('div', { class: 'questions' });
  const result = el('div', { class: 'summary', 'aria-live': 'polite' });
  const render = (): Plan | null => {
    const state = choices(level, chosen, all);
    questions.replaceChildren(...state.questions.map((question) => fieldset(level, question)));
    result.replaceChildren(el('p', { class: 'label' }, 'Your plan so far'), summary(state.plan));
    return state.plan;
  };
  questions.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    chosen.set(input.name, input.value);
    onChange(render());
    // The groups are rebuilt, so put the focus back on the chosen option.
    [...questions.querySelectorAll('input')]
      .find(({ name, value }) => name === input.name && value === input.value)
      ?.focus();
  });
  render();
  return el(
    'section',
    { class: 'part builder', 'aria-labelledby': 'builder-title' },
    el('h3', { id: 'builder-title' }, 'Your plan'),
    el(
      'p',
      {},
      'Answer each question to build a plan. Choices that this level fixes are shown but cannot be picked.',
    ),
    questions,
    result,
  );
}

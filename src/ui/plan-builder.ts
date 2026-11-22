/**
 * The plan builder: one question per screen, answered with big buttons in
 * plain words, the database term underneath. Tapping an answer moves to the
 * next question; Back goes to the previous one. A question with a single
 * answer and nothing locked is answered without asking. When the plan is
 * complete, a review screen lists it.
 */
import type { Level, Plan, Scan, Step } from '../engine/index.ts';
import { el, type Child } from './dom.ts';
import { formatCount } from './format.ts';
import { candidates, choices, type Question } from './plan-choices.ts';

const code = (text: string): HTMLElement => el('code', {}, text);

type ScanJoin = 'hash' | 'nestedLoop' | 'merge';

/** Each join method in plain words, then its database name. */
const METHODS: Readonly<Record<ScanJoin, readonly [string, string]>> = {
  hash: ['Match them in one pass', 'Hash join'],
  merge: ['Sort both sides and zip them', 'Merge join'],
  nestedLoop: ['Compare every pair', 'Nested loop'],
};

function title({ kind, table, step }: Question): Child[] {
  switch (kind) {
    case 'start':
      return ['Which table do you start with?'];
    case 'next':
      return [step === 1 ? 'Which table do you join to it?' : 'Which table do you join next?'];
    case 'access':
      return ['How do you read ', code(table), '?'];
    case 'method':
      return ['How do you join ', code(table), '?'];
  }
}

/** A line of an answer or of the plan: what it does, and what the database calls it. */
const line = (what: readonly Child[], term: readonly Child[]): Child[] => [
  el('span', { class: 'what' }, ...what),
  ' ',
  el('span', { class: 'term' }, ...term),
];

const indexColumn = (level: Level, table: string, index: string): string =>
  String(
    level.tables.find(({ name }) => name === table)?.indexes.find(({ name }) => name === index)
      ?.column,
  );

/** How a table is read, as a line. */
const reading = (level: Level, scan: Scan): Child[] =>
  scan.access === 'seq'
    ? line(['Read every row of ', code(scan.table)], ['Seq scan'])
    : line(
        ['Jump into ', code(scan.table), ' by ', code(indexColumn(level, scan.table, scan.index))],
        ['Index scan on ', code(scan.index)],
      );

const rows = (n: number): string => `${formatCount(n)} ${n === 1 ? 'row' : 'rows'}`;

function answer(
  level: Level,
  guesses: ReadonlyMap<string, number>,
  { kind, table }: Question,
  value: string,
): Child[] {
  if (kind === 'start' || kind === 'next') {
    const guess = guesses.get(value);
    return [
      el('span', { class: 'what' }, code(value)),
      ' ',
      el(
        'span',
        { class: 'term' },
        rows(level.tables.find(({ name }) => name === value)?.rows ?? 0),
      ),
      ...(guess === undefined
        ? []
        : [' ', el('span', { class: 'guess' }, `The Optimizer guesses ${rows(guess)} match`)]),
    ];
  }
  const [prefix, index = ''] = value.split(':');
  if (prefix === 'seq') return line(['Read every row'], ['Seq scan']);
  if (prefix === 'index') {
    return line(
      ['Jump to rows by ', code(indexColumn(level, table, index))],
      ['Index scan on ', code(index)],
    );
  }
  if (prefix === 'indexNestedLoop') {
    return line(['Look each one up'], ['Index nested loop through ', code(index)]);
  }
  const [what, term] = METHODS[value as ScanJoin];
  return line([what], [term]);
}

/** A join step of the plan, as one or two lines. */
const joining = (level: Level, step: Step): HTMLElement[] => {
  if (step.join === 'indexNestedLoop') {
    return [
      el(
        'li',
        {},
        ...line(
          ['Join ', code(step.table), ': look each one up'],
          ['Index nested loop through ', code(step.index)],
        ),
      ),
    ];
  }
  const [what, term] = METHODS[step.join];
  return [
    el('li', {}, ...line(['Join ', code(step.scan.table), `: ${what.toLowerCase()}`], [term])),
    el('li', {}, ...reading(level, step.scan)),
  ];
};

/**
 * The builder for `level`. `onChange` gets the plan when the review screen
 * shows it, and null when the player leaves it. `guesses` are the
 * Optimizer's row estimates, by table.
 */
export function renderPlanBuilder(
  level: Level,
  onChange: (plan: Plan | null) => void = () => undefined,
  guesses: ReadonlyMap<string, number> = new Map(),
): HTMLElement {
  const all = candidates(level);
  const chosen = new Map<string, string>();
  // Which asked question is on the screen; past the last one, the review.
  let position = 0;
  const step = el('p', { class: 'step' });
  const heading = el('h3', { id: 'builder-title', tabindex: '-1' });
  const body = el('div');
  const back = el('button', { type: 'button', class: 'back-button' }, 'Back');
  const next = el('button', { type: 'button', class: 'run-button' }, 'Next');
  const controls = el('div', { class: 'run-controls' }, back, next);

  const render = (focus: boolean): void => {
    const state = choices(level, chosen, all);
    const asked = state.questions.filter(({ options }) => options.length > 1);
    const question = asked[position];
    back.hidden = position === 0;
    controls.hidden = question === undefined;
    if (question !== undefined) {
      step.textContent = `Question ${String(position + 1)}`;
      heading.replaceChildren(...title(question));
      body.replaceChildren(
        el(
          'div',
          { class: 'answers', role: 'group', 'aria-labelledby': 'builder-title' },
          ...question.options.map(({ value, enabled }) => {
            const button = el(
              'button',
              {
                type: 'button',
                class: 'answer',
                'aria-pressed': String(value === question.answer),
              },
              ...answer(level, guesses, question, value),
              ...(enabled ? [] : [' ', el('span', { class: 'locked' }, 'Locked by this level')]),
            );
            button.disabled = !enabled;
            button.addEventListener('click', () => {
              chosen.set(question.key, value);
              position += 1;
              render(true);
            });
            return button;
          }),
        ),
      );
      next.disabled = question.answer === null;
      onChange(null);
    } else if (state.plan !== null) {
      // Every question is answered, so the plan is complete.
      const { plan } = state;
      const change = el('button', { type: 'button', class: 'link-button' }, 'Change your plan');
      change.hidden = asked.length === 0;
      change.addEventListener('click', () => {
        position -= 1;
        render(true);
      });
      step.textContent = 'On the grid';
      heading.replaceChildren('Your plan');
      body.replaceChildren(
        el(
          'ol',
          { class: 'summary' },
          el('li', {}, ...reading(level, plan.first)),
          ...plan.steps.flatMap((s) => joining(level, s)),
        ),
        change,
      );
      onChange(plan);
    }
    // A new screen: move the focus to its title, so it is read out first.
    if (focus) heading.focus();
  };

  back.addEventListener('click', () => {
    position -= 1;
    render(true);
  });
  next.addEventListener('click', () => {
    position += 1;
    render(true);
  });
  render(false);
  return el(
    'section',
    { class: 'part builder', 'aria-labelledby': 'builder-title' },
    step,
    heading,
    body,
    controls,
  );
}

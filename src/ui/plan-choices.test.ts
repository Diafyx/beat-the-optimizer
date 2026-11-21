import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allowedByLocks, enumeratePlans, type Level, type Lock } from '../engine/index.ts';
import { LEVEL_IDS } from '../levels.ts';
import { candidates, choices } from './plan-choices.ts';

const read = (path: string): Level => JSON.parse(readFileSync(path, 'utf8')) as Level;
const example = read('tests/fixtures/example-level.json');
const levels = LEVEL_IDS.map((id) => read(`levels/${id}.json`));

/** Every plan the builder lets the player finish, by trying every enabled option. */
function buildable(level: Level): string[] {
  const all = candidates(level);
  const plans: string[] = [];
  const walk = (chosen: ReadonlyMap<string, string>): void => {
    const { questions, plan } = choices(level, chosen, all);
    if (plan !== null) {
      plans.push(JSON.stringify(plan));
      return;
    }
    const open = questions.at(-1);
    for (const option of open?.options.filter(({ enabled }) => enabled) ?? []) {
      walk(new Map([...chosen, [open?.key ?? '', option.value]]));
    }
  };
  walk(new Map());
  return plans;
}

const allowed = (level: Level): string[] =>
  enumeratePlans(level)
    .filter((plan) => allowedByLocks(level, plan))
    .map((plan) => JSON.stringify(plan));

const locked: [string, Lock[]][] = [
  ['a join method', [{ kind: 'joinMethod', method: 'hash' }]],
  ['an access path', [{ kind: 'access', scan: { table: 'books', access: 'seq' } }]],
  ['a join order', [{ kind: 'joinOrder', tables: ['books', 'authors'] }]],
];

describe('choices', () => {
  it.each(levels.map((level) => [level.id, level] as const))(
    'in %s builds every plan in the plan space, each once',
    (_, level) => {
      const built = buildable(level);
      expect(built.sort()).toEqual(allowed(level).sort());
      expect(new Set(built).size).toBe(built.length);
    },
  );

  it.each(locked)('builds exactly the plans that %s allows', (_, locks) => {
    const level = { ...example, locks };
    const built = buildable(level);
    expect(built.length).toBeLessThan(enumeratePlans(level).length);
    expect(built.sort()).toEqual(allowed(level).sort());
  });

  it('starts by asking for the first table, then how it is read', () => {
    const { questions, plan } = choices(example, new Map());
    expect(plan).toBeNull();
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ kind: 'start', key: 'start', answer: null });
    expect(questions[0]?.options).toEqual([
      { value: 'authors', enabled: true },
      { value: 'books', enabled: true },
    ]);
    const next = choices(example, new Map([['start', 'books']])).questions[1];
    expect(next).toMatchObject({ kind: 'access', key: 'access:books', table: 'books', step: 0 });
    expect(next?.options.map(({ value }) => value)).toEqual([
      'seq',
      'index:books_pkey',
      'index:books_author_id_idx',
    ]);
  });

  it('answers a question with one enabled option by itself', () => {
    // authors is the only table left to join to books.
    const { questions } = choices(
      example,
      new Map([
        ['start', 'books'],
        ['access:books', 'seq'],
      ]),
    );
    expect(questions[2]).toMatchObject({
      kind: 'next',
      key: 'next:1',
      table: 'authors',
      step: 1,
      options: [{ value: 'authors', enabled: true }],
      answer: 'authors',
    });
    expect(questions[3]).toMatchObject({ kind: 'method', table: 'authors', answer: null });
    expect(questions[3]?.options.map(({ value }) => value)).toEqual([
      'hash',
      'nestedLoop',
      'merge',
      'indexNestedLoop:authors_pkey',
    ]);
  });

  it('shows locked options disabled and never picks them', () => {
    const level = { ...example, locks: [{ kind: 'joinMethod', method: 'merge' } as const] };
    const chosen = new Map([
      ['start', 'authors'],
      ['access:authors', 'seq'],
      ['method:books', 'hash'],
    ]);
    const { questions } = choices(level, chosen);
    const method = questions.find(({ kind }) => kind === 'method');
    expect(method?.options).toEqual([
      { value: 'hash', enabled: false },
      { value: 'nestedLoop', enabled: false },
      { value: 'merge', enabled: true },
      { value: 'indexNestedLoop:books_author_id_idx', enabled: false },
    ]);
    expect(method?.answer).toBe('merge');
  });

  it('keeps later answers that still fit when an earlier one changes', () => {
    const chosen = new Map([
      ['start', 'authors'],
      ['access:authors', 'seq'],
      ['method:books', 'hash'],
      ['access:books', 'seq'],
    ]);
    const before = choices(example, chosen).plan;
    const after = choices(example, new Map([...chosen, ['access:authors', 'index:authors_pkey']]));
    expect(before?.first).toEqual({ table: 'authors', access: 'seq' });
    expect(after.plan).toEqual({
      first: { table: 'authors', access: 'index', index: 'authors_pkey' },
      steps: [{ join: 'hash', scan: { table: 'books', access: 'seq' } }],
    });
  });

  it('asks no access question for the inner table of an index nested loop', () => {
    const { questions, plan } = choices(
      example,
      new Map([
        ['start', 'authors'],
        ['access:authors', 'seq'],
        ['method:books', 'indexNestedLoop:books_author_id_idx'],
        ['access:books', 'seq'],
      ]),
    );
    expect(questions.map(({ key }) => key)).toEqual([
      'start',
      'access:authors',
      'next:1',
      'method:books',
    ]);
    expect(plan?.steps).toEqual([
      { join: 'indexNestedLoop', table: 'books', index: 'books_author_id_idx' },
    ]);
  });

  it('ignores an answer that is not an option', () => {
    const { questions, plan } = choices(example, new Map([['start', 'publishers']]));
    expect(questions).toHaveLength(1);
    expect(questions[0]?.answer).toBeNull();
    expect(plan).toBeNull();
  });
});

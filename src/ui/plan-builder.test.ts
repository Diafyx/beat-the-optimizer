// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Level, Plan } from '../engine/index.ts';
import { renderPlanBuilder } from './plan-builder.ts';

const example = JSON.parse(readFileSync('tests/fixtures/example-level.json', 'utf8')) as Level;
const guesses = new Map([['authors', 20]]);

const text = (node: Element | null | undefined): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const buttons = (builder: HTMLElement, selector: string): HTMLButtonElement[] => [
  ...builder.querySelectorAll<HTMLButtonElement>(selector),
];

/** The screen: its step, its title, then each answer, marked if chosen or locked. */
const screen = (builder: HTMLElement): string[] => [
  text(builder.querySelector('.step')),
  text(builder.querySelector('h3')),
  ...buttons(builder, '.answer').map(
    (b) =>
      `${b.getAttribute('aria-pressed') === 'true' ? '(x)' : '( )'}${b.disabled ? ' locked' : ''} ${text(b)}`,
  ),
];

const summary = (builder: HTMLElement): string[] =>
  [...builder.querySelectorAll('.summary li')].map(text);

function click(builder: HTMLElement, selector: string, name: string): void {
  const found = buttons(builder, selector).find((b) => text(b) === name);
  if (found === undefined) throw new Error(`no ${name} in ${selector}`);
  found.click();
}

/** Taps the answer whose plain words are `what`. */
function tap(builder: HTMLElement, what: string): void {
  const found = buttons(builder, '.answer').find((b) => text(b.querySelector('.what')) === what);
  if (found === undefined) throw new Error(`no answer ${what}`);
  found.click();
}

const controls = (builder: HTMLElement): HTMLElement | null =>
  builder.querySelector<HTMLElement>('.run-controls');

describe('renderPlanBuilder', () => {
  it('asks the first question, with each table’s rows and the Optimizer’s guess', () => {
    const onChange = vi.fn<(plan: Plan | null) => void>();
    const builder = renderPlanBuilder(example, onChange, guesses);
    expect(screen(builder)).toEqual([
      'Question 1',
      'Which table do you start with?',
      '( ) authors 1,000 rows The Optimizer guesses 20 rows match',
      '( ) books 20,000 rows',
    ]);
    expect(builder.querySelector('.answers')?.getAttribute('role')).toBe('group');
    expect(controls(builder)?.hidden).toBe(false);
    expect(buttons(builder, '.back-button')[0]?.hidden).toBe(true);
    expect(buttons(builder, '.run-controls .run-button')[0]?.disabled).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('moves on with each answer, skips a question with one answer, and reviews the plan', () => {
    const onChange = vi.fn<(plan: Plan | null) => void>();
    const builder = renderPlanBuilder(example, onChange, guesses);
    tap(builder, 'authors');
    expect(screen(builder)).toEqual([
      'Question 2',
      'How do you read authors?',
      '( ) Read every row Seq scan',
      '( ) Jump to rows by author_id Index scan on authors_pkey',
    ]);
    tap(builder, 'Read every row');
    // books is the only table left, so the next question is how to join it.
    expect(screen(builder)).toEqual([
      'Question 3',
      'How do you join books?',
      '( ) Match them in one pass Hash join',
      '( ) Compare every pair Nested loop',
      '( ) Sort both sides and zip them Merge join',
      '( ) Look each one up Index nested loop through books_author_id_idx',
    ]);
    tap(builder, 'Sort both sides and zip them');
    expect(text(builder.querySelector('h3'))).toBe('How do you read books?');
    expect(onChange).toHaveBeenLastCalledWith(null);
    tap(builder, 'Jump to rows by author_id');
    const plan: Plan = {
      first: { table: 'authors', access: 'seq' },
      steps: [
        { join: 'merge', scan: { table: 'books', access: 'index', index: 'books_author_id_idx' } },
      ],
    };
    expect(onChange).toHaveBeenLastCalledWith(plan);
    expect(screen(builder).slice(0, 2)).toEqual(['On the grid', 'Your plan']);
    expect(summary(builder)).toEqual([
      'Read every row of authors Seq scan',
      'Join books: sort both sides and zip them Merge join',
      'Jump into books by author_id Index scan on books_author_id_idx',
    ]);
    expect(controls(builder)?.hidden).toBe(true);
  });

  it('describes an index nested loop, and an index scan of the first table', () => {
    const builder = renderPlanBuilder(example);
    tap(builder, 'authors');
    tap(builder, 'Jump to rows by author_id');
    tap(builder, 'Look each one up');
    expect(summary(builder)).toEqual([
      'Jump into authors by author_id Index scan on authors_pkey',
      'Join books: look each one up Index nested loop through books_author_id_idx',
    ]);
  });

  it('goes back, keeps the answers, and changes the plan from the review', () => {
    const onChange = vi.fn<(plan: Plan | null) => void>();
    const builder = renderPlanBuilder(example, onChange);
    tap(builder, 'books');
    tap(builder, 'Read every row');
    tap(builder, 'Match them in one pass');
    tap(builder, 'Read every row');
    expect(summary(builder)[1]).toBe('Join authors: match them in one pass Hash join');

    click(builder, '.link-button', 'Change your plan');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen(builder)[1]).toBe('How do you read authors?');
    expect(screen(builder)[2]).toBe('(x) Read every row Seq scan');
    click(builder, '.back-button', 'Back');
    click(builder, '.back-button', 'Back');
    expect(screen(builder)[0]).toBe('Question 2');
    expect(screen(builder)[2]).toBe('(x) Read every row Seq scan');
    click(builder, '.run-button', 'Next');
    tap(builder, 'Compare every pair');
    tap(builder, 'Read every row');
    expect(summary(builder)[1]).toBe('Join authors: compare every pair Nested loop');
  });

  it('shows locked answers, and answers for the player when only one is left', () => {
    const builder = renderPlanBuilder({
      ...example,
      locks: [{ kind: 'access', scan: { table: 'authors', access: 'seq' } }],
    });
    tap(builder, 'authors');
    expect(screen(builder).slice(2)).toEqual([
      '(x) Read every row Seq scan',
      '( ) locked Jump to rows by author_id Index scan on authors_pkey Locked by this level',
    ]);
    click(builder, '.run-button', 'Next');
    expect(screen(builder)[1]).toBe('How do you join books?');
  });

  it('asks which table joins next in a three-table level', () => {
    const level = JSON.parse(readFileSync('levels/signed-copies.json', 'utf8')) as Level;
    const builder = renderPlanBuilder(level);
    tap(builder, 'orders');
    tap(builder, 'Read every row');
    expect(screen(builder).slice(1, 2)).toEqual(['Which table do you join to it?']);
    tap(builder, 'customers');
    tap(builder, 'Match them in one pass');
    tap(builder, 'Read every row');
    // order_lines is the only table left.
    expect(screen(builder)[1]).toBe('How do you join order_lines?');
  });

  it('goes straight to the review when the level leaves no choice', () => {
    const [authors] = example.tables;
    if (authors === undefined) throw new Error('no table');
    const builder = renderPlanBuilder({
      ...example,
      tables: [{ ...authors, indexes: [] }],
      joins: [],
      orderBy: null,
    });
    expect(summary(builder)).toEqual(['Read every row of authors Seq scan']);
    expect(buttons(builder, '.link-button')[0]?.hidden).toBe(true);
  });

  it('moves the focus to the title of each new screen', () => {
    const builder = renderPlanBuilder(example);
    document.body.replaceChildren(builder);
    expect(document.activeElement).not.toBe(builder.querySelector('h3'));
    tap(builder, 'books');
    expect(document.activeElement).toBe(builder.querySelector('h3'));
  });
});

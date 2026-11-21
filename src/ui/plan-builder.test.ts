// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Level, Plan } from '../engine/index.ts';
import { renderPlanBuilder } from './plan-builder.ts';

const example = JSON.parse(readFileSync('tests/fixtures/example-level.json', 'utf8')) as Level;

const text = (node: Element | null | undefined): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const legends = (builder: HTMLElement): string[] =>
  [...builder.querySelectorAll('legend')].map(text);

/** Each option of the group for question `key`: its label, and whether it is checked or disabled. */
const group = (builder: HTMLElement, key: string): string[] =>
  [...builder.querySelectorAll<HTMLInputElement>(`input[name="${key}"]`)].map(
    (input) =>
      `${input.checked ? '(x)' : '( )'}${input.disabled ? ' disabled' : ''} ${text(input.parentElement)}`,
  );

function pick(builder: HTMLElement, key: string, value: string): void {
  const input = [...builder.querySelectorAll<HTMLInputElement>('input')].find(
    (candidate) => candidate.name === key && candidate.value === value,
  );
  if (input === undefined) throw new Error(`no option ${value} for ${key}`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('renderPlanBuilder', () => {
  it('asks for the first table, and has no plan yet', () => {
    const builder = renderPlanBuilder(example);
    expect(builder.querySelector('h3')?.textContent).toBe('Your plan');
    expect(legends(builder)).toEqual(['Which table do you read first?']);
    expect(group(builder, 'start')).toEqual(['( ) authors', '( ) books']);
    expect(text(builder.querySelector('.summary p:last-child'))).toBe(
      'Answer the questions above to finish your plan.',
    );
  });

  it('asks the next question after each answer and reports the plan', () => {
    const onChange = vi.fn<(plan: Plan | null) => void>();
    const builder = renderPlanBuilder(example, onChange);
    pick(builder, 'start', 'authors');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(group(builder, 'access:authors')).toEqual([
      '( ) Seq scan',
      '( ) Index scan on authors_pkey (author_id)',
    ]);
    pick(builder, 'access:authors', 'seq');
    expect(legends(builder)).toEqual([
      'Which table do you read first?',
      'How do you read authors?',
      'Which table do you join to it?',
      'How do you join books?',
    ]);
    expect(group(builder, 'next:1')).toEqual(['(x) books']);
    expect(group(builder, 'method:books')).toEqual([
      '( ) Hash join',
      '( ) Nested loop',
      '( ) Merge join',
      '( ) Index nested loop through books_author_id_idx',
    ]);
    pick(builder, 'method:books', 'merge');
    pick(builder, 'access:books', 'index:books_author_id_idx');
    const plan: Plan = {
      first: { table: 'authors', access: 'seq' },
      steps: [
        { join: 'merge', scan: { table: 'books', access: 'index', index: 'books_author_id_idx' } },
      ],
    };
    expect(onChange).toHaveBeenLastCalledWith(plan);
    expect([...builder.querySelectorAll('.summary li')].map(text)).toEqual([
      'Read authors with a seq scan.',
      'Join books with a merge join, reading it through books_author_id_idx.',
    ]);
  });

  it('describes an index nested loop, and an index scan of the first table', () => {
    const builder = renderPlanBuilder(example);
    pick(builder, 'start', 'authors');
    pick(builder, 'access:authors', 'index:authors_pkey');
    pick(builder, 'method:books', 'indexNestedLoop:books_author_id_idx');
    expect(legends(builder)).toHaveLength(4);
    expect([...builder.querySelectorAll('.summary li')].map(text)).toEqual([
      'Read authors through authors_pkey.',
      'Join books with an index nested loop through books_author_id_idx.',
    ]);
  });

  it('describes hash joins and nested loops', () => {
    const builder = renderPlanBuilder(example);
    pick(builder, 'start', 'books');
    pick(builder, 'access:books', 'seq');
    pick(builder, 'method:authors', 'hash');
    pick(builder, 'access:authors', 'seq');
    expect(text(builder.querySelectorAll('.summary li')[1])).toBe(
      'Join authors with a hash join, reading it with a seq scan.',
    );
    pick(builder, 'method:authors', 'nestedLoop');
    expect(text(builder.querySelectorAll('.summary li')[1])).toBe(
      'Join authors with a nested loop, reading it with a seq scan.',
    );
  });

  it('shows locked options disabled', () => {
    const builder = renderPlanBuilder({
      ...example,
      locks: [{ kind: 'access', scan: { table: 'authors', access: 'seq' } }],
    });
    pick(builder, 'start', 'authors');
    expect(group(builder, 'access:authors')).toEqual([
      '(x) Seq scan',
      '( ) disabled Index scan on authors_pkey (author_id)Locked by this level',
    ]);
  });

  it('asks which table joins next in a three-table level', () => {
    const level = JSON.parse(readFileSync('levels/signed-copies.json', 'utf8')) as Level;
    const builder = renderPlanBuilder(level);
    pick(builder, 'start', 'orders');
    pick(builder, 'access:orders', 'seq');
    expect(group(builder, 'next:1')).toEqual(['( ) customers', '( ) order_lines']);
    pick(builder, 'next:1', 'customers');
    pick(builder, 'method:customers', 'hash');
    pick(builder, 'access:customers', 'seq');
    expect(legends(builder).at(-2)).toBe('Which table do you join next?');
    expect(group(builder, 'next:2')).toEqual(['(x) order_lines']);
  });

  it('keeps the focus on the chosen option after rebuilding the groups', () => {
    const builder = renderPlanBuilder(example);
    document.body.replaceChildren(builder);
    pick(builder, 'start', 'books');
    const focused = document.activeElement as HTMLInputElement;
    expect([focused.name, focused.value, focused.checked]).toEqual(['start', 'books', true]);
  });
});

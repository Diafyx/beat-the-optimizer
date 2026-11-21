// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Level, Lock } from '../engine/index.ts';
import { LEVEL_IDS, loadLevel } from '../levels.ts';
import { renderLevel } from './level-view.ts';
import { renderPlanBuilder } from './plan-builder.ts';
import { renderRun } from './run.ts';

const example = JSON.parse(readFileSync('tests/fixtures/example-level.json', 'utf8')) as Level;

const text = (element: HTMLElement): string => element.textContent.replace(/\s+/g, ' ');

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing');
  return value;
}

const headings = (element: HTMLElement, tag: string): string[] =>
  [...element.querySelectorAll<HTMLElement>(tag)].map(text);

describe('renderLevel', () => {
  it('shows the title, story and query', () => {
    const view = renderLevel(example);
    expect(view.querySelector('h2')?.textContent).toBe('Books by New Zealand authors');
    expect([...view.querySelectorAll('.story')].map((p) => p.textContent)).toEqual(example.story);
    expect(view.querySelector('pre code')?.textContent).toBe(example.sql);
  });

  it('shows each table with its rows, storage, filter, columns and indexes', () => {
    const view = renderLevel(example);
    expect(headings(view, 'h4')).toEqual(['authors', 'books']);
    const shown = text(must(view.querySelector<HTMLElement>('[aria-labelledby="table-authors"]')));
    expect(shown).toContain('1,000 rows, stored in order of author_id.');
    expect(shown).toContain("Filter: country = 'NZ'");
    expect(shown).toContain('author_id integer');
    expect(shown).toContain('authors_pkey on author_id');
  });

  it('shows the statistics of the columns that have them', () => {
    const view = renderLevel(example);
    expect(headings(view, 'h5')).toEqual([
      'Statistics on author_id',
      'Statistics on country',
      'Statistics on author_id',
    ]);
    const [authorId, country] = [...view.querySelectorAll<HTMLElement>('.stats')].map(must);
    expect(text(must(authorId))).toContain('Distinct values1,000Nulls0%');
    expect(text(must(authorId))).toContain('Correlation with the stored order1.00');
    expect(text(must(authorId))).toContain(
      'The other values are split into 4 ranges with the same number of rows, from 1 to 1000.',
    );
    expect(authorId?.querySelector('table')).toBeNull();
    const rows = [...(country?.querySelectorAll('tbody tr') ?? [])].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ["'US'", '30%'],
      ["'GB'", '15%'],
      ["'NZ'", '2%'],
    ]);
    expect(country?.querySelector('caption')?.textContent).toBe('Most common values');
    expect(text(must(country))).not.toContain('ranges');
  });

  it('shows the joins and the order of the result', () => {
    const view = renderLevel(example);
    expect(headings(view, 'h3')).toEqual(['The query', 'The tables', 'Joins', 'Order']);
    expect(text(view)).toContain('authors.author_id = books.author_id');
    expect(text(view)).toContain('The result is sorted by authors.author_id, ascending.');
  });

  it('shows a lone table without joins, order or locks', () => {
    const [authors] = example.tables;
    const view = renderLevel({
      ...example,
      tables: [
        {
          ...must(authors),
          filter: null,
          storedOrder: null,
          indexes: [],
          columns: [
            {
              name: 'author_id',
              type: 'integer',
              stats: {
                nullFraction: 0.25,
                distinct: 3,
                mostCommon: [],
                histogram: [],
                correlation: null,
              },
            },
          ],
        },
      ],
      joins: [],
      orderBy: null,
      locks: [],
    });
    expect(headings(view, 'h3')).toEqual(['The query', 'The table']);
    const shown = text(view);
    expect(shown).toContain('1,000 rows, in no particular order.');
    expect(shown).not.toContain('Filter');
    expect(shown).toContain('IndexesNone.');
    expect(shown).toContain('Distinct values3Nulls25%');
    expect(shown).not.toContain('Correlation');
  });

  it('describes every kind of lock', () => {
    const locks: Lock[] = [
      { kind: 'joinOrder', tables: ['books', 'authors'] },
      { kind: 'joinMethod', method: 'hash' },
      { kind: 'joinMethod', method: 'nestedLoop' },
      { kind: 'joinMethod', method: 'merge' },
      { kind: 'joinMethod', method: 'indexNestedLoop' },
      { kind: 'access', scan: { table: 'authors', access: 'seq' } },
      { kind: 'access', scan: { table: 'books', access: 'index', index: 'books_pkey' } },
    ];
    const view = renderLevel({ ...example, locks });
    const sections = view.querySelectorAll(':scope > section');
    const items = [...(sections[sections.length - 1]?.querySelector('ul')?.children ?? [])].map(
      (item) => item.textContent,
    );
    expect(headings(view, 'h3').at(-1)).toBe('Fixed for this level');
    expect(items).toEqual([
      'The tables are joined in this order: books, then authors.',
      'Every join is a hash join.',
      'Every join is a nested loop.',
      'Every join is a merge join.',
      'Every join is an index nested loop.',
      'authors is read with a seq scan.',
      'books is read through books_pkey.',
    ]);
  });

  // docs/level-format.md: these give away the answer before the run.
  it('never reads before a run what PostgreSQL chose, the true counts, the costs or the explanation', async () => {
    for (const id of LEVEL_IDS) {
      const level = must(await loadLevel(id));
      const hidden = ['cardinalities', 'optimizer', 'costs', 'explanation'];
      const guarded = new Proxy(level, {
        get(target, key, receiver) {
          if (typeof key === 'string' && hidden.includes(key)) throw new Error(`read ${key}`);
          return Reflect.get(target, key, receiver) as unknown;
        },
      });
      expect(renderLevel(guarded).querySelector('h2')?.textContent).toBe(level.title);
      expect(renderPlanBuilder(guarded).querySelector('legend')).not.toBeNull();
      // Until the player presses Run.
      renderRun(guarded).setPlan(level.costs.bestPlan);
    }
  });
});

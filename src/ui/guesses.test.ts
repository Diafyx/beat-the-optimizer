import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExplainNode, Level } from '../engine/index.ts';
import { optimizerGuesses } from './guesses.ts';

const example = JSON.parse(readFileSync('tests/fixtures/example-level.json', 'utf8')) as Level;

const scan = (relation: string, estimatedRows: number): ExplainNode => ({
  nodeType: 'Seq Scan',
  relation,
  index: null,
  estimatedRows,
  estimatedCost: 1,
  children: [],
});

const join = (nodeType: string, outer: ExplainNode, inner: ExplainNode): ExplainNode => ({
  nodeType,
  relation: null,
  index: null,
  estimatedRows: 1,
  estimatedCost: 1,
  children: [outer, inner],
});

/** The example level with `books` filtered too, and this EXPLAIN. */
const withExplain = (explain: ExplainNode): Level => ({
  ...example,
  tables: example.tables.map((t) => (t.name === 'books' ? { ...t, filter: 'price > 10' } : t)),
  optimizer: { ...example.optimizer, explain },
});

describe('optimizerGuesses', () => {
  it('gives the estimate of each filtered table, and none for the others', () => {
    // authors has a filter; books, read on the inner side, has none.
    expect(optimizerGuesses(example)).toEqual(new Map([['authors', 20]]));
  });

  it('leaves out a scan on the inner side of a nested loop', () => {
    const level = withExplain(join('Nested Loop', scan('authors', 20), scan('books', 3)));
    expect(optimizerGuesses(level)).toEqual(new Map([['authors', 20]]));
  });

  it('keeps both sides of other joins, and the first scan of a table', () => {
    const hash = join('Hash Join', scan('books', 700), {
      ...scan('authors', 0),
      nodeType: 'Hash',
      relation: null,
      children: [scan('authors', 20), scan('authors', 99)],
    });
    expect(optimizerGuesses(withExplain(hash))).toEqual(
      new Map([
        ['books', 700],
        ['authors', 20],
      ]),
    );
  });

  // docs/level-format.md: of the hidden fields, only the estimates are read.
  it('reads nothing hidden but the EXPLAIN estimates', () => {
    const optimizer = new Proxy(example.optimizer, {
      get(target, key, receiver) {
        if (key !== 'explain') throw new Error(`read optimizer.${String(key)}`);
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const guarded = new Proxy(
      { ...example, optimizer },
      {
        get(target, key, receiver) {
          if (key === 'cardinalities' || key === 'costs' || key === 'explanation') {
            throw new Error(`read ${key}`);
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      },
    );
    expect(optimizerGuesses(guarded)).toEqual(new Map([['authors', 20]]));
  });
});

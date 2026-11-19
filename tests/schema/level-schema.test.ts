// The level format's JSON Schema (schema/level.schema.json, docs/level-format.md)
// and the hand-written example level in tests/fixtures.
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const exampleText = readFileSync('tests/fixtures/example-level.json', 'utf8');
const example: unknown = JSON.parse(exampleText);
const schema = JSON.parse(readFileSync('schema/level.schema.json', 'utf8')) as {
  $schema: string;
};

// Strict mode rejects unknown keywords and ambiguous schemas.
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

type Path = readonly (string | number)[];

/** A copy of the example with the value at `path` replaced, or deleted if undefined. */
function variant(path: Path, value: unknown): unknown {
  const level = structuredClone(example);
  const keys = [...path];
  const last = keys.pop();
  let node = level as Record<string | number, unknown>;
  for (const key of keys) node = node[key] as Record<string | number, unknown>;
  if (last === undefined) throw new Error('empty path');
  if (value === undefined) {
    Reflect.deleteProperty(node, last);
  } else {
    node[last] = value;
  }
  return level;
}

const tables = (example as { tables: unknown[] }).tables;
const authors = ['tables', 0];
const plan = ['costs', 'bestPlan'];

describe('schema/level.schema.json', () => {
  it('is a draft 2020-12 schema', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('accepts the hand-written example level', () => {
    expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('uses only plain JSON: the example survives a round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(example))).toEqual(JSON.parse(exampleText));
  });

  it.each<[string, Path, unknown]>([
    ['another format version', ['format'], 2],
    ['a missing field', ['orderBy'], undefined],
    ['an unknown field', ['difficulty'], 'hard'],
    ['an id that is not a slug', ['id'], 'Example Level'],
    ['an empty story', ['story'], []],
    ['four tables', ['tables'], [...tables, ...tables]],
    ['a negative row count', [...authors, 'rows'], -1],
    ['a fractional row count', [...authors, 'rows'], 1.5],
    ['a cost above 2^53 - 1', ['costs', 'best'], 2 ** 53],
    ['a frequency above 1', [...authors, 'columns', 2, 'stats', 'mostCommon', 0, 'frequency'], 1.5],
    ['a null in a histogram', [...authors, 'columns', 0, 'stats', 'histogram', 1], null],
    ['an index scan without its index', [...plan, 'first'], { table: 'authors', access: 'index' }],
    [
      'an index nested loop with a scan',
      [...plan, 'steps', 0, 'scan'],
      { table: 'books', access: 'seq' },
    ],
    ['an unknown join method', [...plan, 'steps', 0, 'join'], 'sortMerge'],
    ['an unknown lock', ['locks'], [{ kind: 'sort' }]],
    ['a join cardinality for one table', ['cardinalities', 'joins', 0, 'tables'], ['authors']],
    ['a PostgreSQL version that is not major.minor', ['optimizer', 'postgres'], '18'],
    ['a setting that is not a string', ['optimizer', 'settings', 'jit'], false],
  ])('rejects %s', (_, path, value) => {
    expect(validate(variant(path, value))).toBe(false);
  });

  it('accepts each kind of lock', () => {
    const locks = [
      { kind: 'joinOrder', tables: ['authors', 'books'] },
      { kind: 'joinMethod', method: 'hash' },
      { kind: 'access', scan: { table: 'books', access: 'index', index: 'books_pkey' } },
    ];
    expect(validate(variant(['locks'], locks))).toBe(true);
  });
});

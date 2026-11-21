import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from './generate.ts';
import { parseSpec, type Spec } from './spec.ts';
import { afterAnalyzeSql, copyValue, literal, loadSql } from './sql.ts';

const example = parseSpec(
  readFileSync(new URL('fixtures/example-spec.yaml', import.meta.url), 'utf8'),
);

const HEADER = '-- Generated from a level spec by scripts/generate-data.ts. Do not edit.\n';

const load = (spec: Spec): string => [...loadSql(spec, generate(spec))].join('');

const small: Spec = {
  seed: 1,
  tables: [
    {
      name: 'user',
      rows: 2,
      order: 'id',
      columns: [
        { name: 'id', type: 'bigint', values: { kind: 'sequence' } },
        { name: 'note', type: 'text', values: { kind: 'label', prefix: 'a\\b\t' } },
      ],
      indexes: [
        { name: 'user_pkey', column: 'id', unique: true },
        { name: 'user_note_idx', column: 'note' },
      ],
    },
  ],
  afterAnalyze: [],
};

describe('loadSql', () => {
  it('creates each table, copies its rows in insert order, then builds its indexes', () => {
    expect(load(small)).toBe(
      [
        HEADER,
        "SET client_encoding = 'UTF8';\n",
        '\n',
        'CREATE TABLE "user" (\n',
        '  "id" bigint NOT NULL,\n',
        '  "note" text NOT NULL\n',
        ');\n',
        'COPY "user" ("id", "note") FROM stdin;\n',
        '1\ta\\\\b\\t1\n',
        '2\ta\\\\b\\t2\n',
        '\\.\n',
        'CREATE UNIQUE INDEX "user_pkey" ON "user" ("id");\n',
        'CREATE INDEX "user_note_idx" ON "user" ("note");\n',
      ].join(''),
    );
  });

  it('writes every generated row of the example, the same each time', () => {
    const sql = load(example);
    expect(load(example)).toBe(sql);
    const [customers, orders] = generate(example);
    for (const row of [...(customers?.rows ?? []), ...(orders?.rows ?? [])]) {
      expect(sql).toContain(`\n${row.map(String).join('\t')}\n`);
    }
    expect(sql.match(/^COPY /gm)).toHaveLength(2);
    expect(sql.split('\n').filter((line) => /^\d/.test(line))).toHaveLength(220);
    expect(sql).toContain('  "created_at" date NOT NULL\n');
  });

  it('fails before writing anything if a unique index has repeated values', () => {
    const spec: Spec = {
      ...small,
      tables: [
        {
          name: 't',
          rows: 3,
          order: 'shuffled',
          columns: [{ name: 'a', type: 'integer', values: { kind: 'uniform', min: 1, max: 2 } }],
          indexes: [{ name: 't_a_key', column: 'a', unique: true }],
        },
      ],
    };
    expect(() => loadSql(spec, generate(spec))).toThrow(
      'The unique index t_a_key is on t.a, which has repeated values',
    );
  });
});

describe('copyValue', () => {
  it.each([
    [42, '42'],
    ['plain text', 'plain text'],
    ['back\\slash', 'back\\\\slash'],
    ['tab\there', 'tab\\there'],
    ['line\nbreak\r', 'line\\nbreak\\r'],
    ['\\.', '\\\\.'],
    ['\\N', '\\\\N'],
  ])('writes %j as %j', (value, expected) => {
    expect(copyValue(value)).toBe(expected);
  });
});

describe('literal', () => {
  it.each([
    [42, '42'],
    [-1.5, '-1.5'],
    ['NZ', "'NZ'"],
    ["o'brien", "'o''brien'"],
    ['a\\b', "'a\\b'"],
  ])('writes %s as %s', (value, sql) => {
    expect(literal(value)).toBe(sql);
  });
});

describe('afterAnalyzeSql', () => {
  it('ends each statement in one semicolon', () => {
    expect(
      afterAnalyzeSql({ ...small, afterAnalyze: ['  UPDATE t SET a = 1 ', 'DELETE FROM t;;'] }),
    ).toBe(`${HEADER}UPDATE t SET a = 1;\nDELETE FROM t;\n`);
  });

  it('is only the header when there are no statements', () => {
    expect(afterAnalyzeSql(small)).toBe(HEADER);
  });
});

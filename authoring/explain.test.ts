import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Level } from '../src/engine/level.ts';
import { mapExplain } from './explain.ts';

type Node = Record<string, unknown>;

/** An EXPLAIN (FORMAT JSON) node with made-up estimates. */
const node = (type: string, fields: Node = {}, ...plans: Node[]): Node => ({
  'Node Type': type,
  'Plan Rows': 10,
  'Total Cost': 1.5,
  ...fields,
  ...(plans.length > 0 ? { Plans: plans } : {}),
});
const seq = (table: string, alias = table) =>
  node('Seq Scan', { 'Relation Name': table, Alias: alias });
const index = (type: string, table: string, name: string, cond?: string) =>
  node(type, {
    'Relation Name': table,
    Alias: table,
    'Index Name': name,
    ...(cond === undefined ? {} : { 'Index Cond': cond }),
  });
const output = (plan: unknown) => [{ Plan: plan }];
const plan = (root: Node) => mapExplain(output(root)).plan;

describe('mapExplain', () => {
  it("maps the example level's EXPLAIN output to its plan and summary", () => {
    const level = JSON.parse(
      readFileSync(new URL('../tests/fixtures/example-level.json', import.meta.url), 'utf8'),
    ) as Level;
    const explain: unknown = JSON.parse(
      readFileSync(new URL('fixtures/explain/index-nested-loop.json', import.meta.url), 'utf8'),
    );
    expect(mapExplain(explain)).toEqual({
      plan: level.optimizer.plan,
      explain: level.optimizer.explain,
    });
  });

  it('maps three tables joined by hash, with the joined side first, and drops sorts', () => {
    const root = node(
      'Sort',
      {},
      node(
        'Hash Join',
        {},
        seq('items'),
        node(
          'Hash',
          {},
          node(
            'Hash Join',
            {},
            seq('orders'),
            node(
              'Hash',
              {},
              node(
                'Bitmap Heap Scan',
                { 'Relation Name': 'customers', Alias: 'c' },
                node('Bitmap Index Scan', { 'Index Name': 'customers_city_idx' }),
              ),
            ),
          ),
        ),
      ),
    );
    expect(plan(root)).toEqual({
      first: { table: 'orders', access: 'seq' },
      steps: [
        {
          join: 'hash',
          scan: { table: 'customers', access: 'index', index: 'customers_city_idx' },
        },
        { join: 'hash', scan: { table: 'items', access: 'seq' } },
      ],
    });
  });

  it('maps a merge join and an index nested loop through Memoize to an index-only scan', () => {
    const root = node(
      'Merge Join',
      {},
      index('Index Scan', 'customers', 'customers_pkey'),
      node(
        'Sort',
        {},
        node(
          'Nested Loop',
          {},
          seq('orders', 'o'),
          node(
            'Memoize',
            {},
            index('Index Only Scan', 'items', 'items_order_id_idx', '(order_id = o.order_id)'),
          ),
        ),
      ),
    );
    expect(plan(root)).toEqual({
      first: { table: 'orders', access: 'seq' },
      steps: [
        { join: 'indexNestedLoop', table: 'items', index: 'items_order_id_idx' },
        { join: 'merge', scan: { table: 'customers', access: 'index', index: 'customers_pkey' } },
      ],
    });
  });

  it('keeps the outer input first when both inputs of a hash join are tables', () => {
    expect(plan(node('Hash Join', {}, seq('a'), node('Hash', {}, seq('b'))))).toEqual({
      first: { table: 'a', access: 'seq' },
      steps: [{ join: 'hash', scan: { table: 'b', access: 'seq' } }],
    });
  });

  it.each([
    ['a materialised seq scan', node('Materialize', {}, seq('b'))],
    ['an index scan with no index condition', index('Index Scan', 'b', 'b_idx')],
    [
      'an index scan on its own filter, with the alias only in a string',
      index('Index Scan', 'b', 'b_idx', "(name = 'x a.y''a.z')"),
    ],
    ['an index scan naming a longer alias', index('Index Scan', 'b', 'b_idx', '(x = ba.x)')],
  ])('maps a nested loop over %s to a plain nested loop', (_, inner) => {
    const [step] = plan(node('Nested Loop', {}, seq('a'), inner)).steps;
    expect(step?.join).toBe('nestedLoop');
  });

  it('summarises every node, folded ones included', () => {
    const { explain } = mapExplain(
      output(node('Hash Join', {}, seq('a'), node('Hash', { 'Total Cost': 3 }, seq('b')))),
    );
    expect(explain.children[1]).toEqual({
      nodeType: 'Hash',
      relation: null,
      index: null,
      estimatedRows: 10,
      estimatedCost: 3,
      children: [
        {
          nodeType: 'Seq Scan',
          relation: 'b',
          index: null,
          estimatedRows: 10,
          estimatedCost: 1.5,
          children: [],
        },
      ],
    });
  });

  it.each([
    ['an unknown node', node('Aggregate', {}, seq('a')), 'Unknown EXPLAIN node type Aggregate'],
    [
      'a parallel plan',
      node('Gather', {}, seq('a')),
      'Gather runs workers in parallel, which the plan space does not have',
    ],
    [
      'a parallel merge',
      node('Gather Merge', {}, seq('a')),
      'Gather Merge runs workers in parallel, which the plan space does not have',
    ],
    [
      'a BitmapAnd',
      node('Bitmap Heap Scan', { 'Relation Name': 'a', Alias: 'a' }, node('BitmapAnd')),
      'BitmapAnd combines several indexes, which the plan space does not have',
    ],
    [
      'a BitmapOr',
      node('Bitmap Heap Scan', { 'Relation Name': 'a', Alias: 'a' }, node('BitmapOr')),
      'BitmapOr combines several indexes, which the plan space does not have',
    ],
    [
      'a nested loop over a join',
      node('Nested Loop', {}, seq('a'), node('Hash Join', {}, seq('b'), seq('c'))),
      'The inner input of Nested Loop is a join, so the plan is not left-deep',
    ],
    [
      'a bushy join',
      node(
        'Hash Join',
        {},
        node('Hash Join', {}, seq('a'), seq('b')),
        node('Merge Join', {}, seq('c'), seq('d')),
      ),
      'Both inputs of Hash Join are joins, so the plan is not left-deep',
    ],
    [
      'a join with one input',
      node('Merge Join', {}, seq('a')),
      'Merge Join has 1 inputs, expected 2',
    ],
    ['a Hash with no input', node('Hash'), 'Hash has 0 inputs, expected 1'],
    ['a scan with no table', node('Seq Scan'), 'Seq Scan has no "Relation Name"'],
    [
      'an index scan with no index',
      node('Index Scan', { 'Relation Name': 'a', Alias: 'a' }),
      'Index Scan has no "Index Name"',
    ],
    [
      'a node with no type',
      { 'Plan Rows': 1, 'Total Cost': 1 },
      'An EXPLAIN node has no "Node Type"',
    ],
    [
      'a field of the wrong type',
      node('Seq Scan', { Alias: 3 }),
      'The EXPLAIN field "Alias" is not a string',
    ],
    [
      'a missing estimate',
      { 'Node Type': 'Seq Scan', 'Total Cost': 1 },
      'The EXPLAIN field "Plan Rows" is not a number',
    ],
    [
      'inputs that are not a list',
      node('Hash', { Plans: {} }),
      'The EXPLAIN field "Plans" is not an array',
    ],
    [
      'an input that is not an object',
      node('Hash', { Plans: [null] }),
      'An EXPLAIN node is not an object',
    ],
  ])('fails on %s', (_, root, message) => {
    expect(() => mapExplain(output(root))).toThrow(new Error(message));
  });

  it.each([
    ['not a list', { Plan: seq('a') }],
    ['two plans', [{ Plan: seq('a') }, { Plan: seq('b') }]],
    ['a list of something else', ['Seq Scan']],
  ])('fails on output that is %s', (_, value) => {
    expect(() => mapExplain(value)).toThrow('EXPLAIN output must be one plan, in FORMAT JSON');
  });
});

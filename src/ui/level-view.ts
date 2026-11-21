/**
 * The view of a level before it is played: what docs/level-format.md lets the
 * player see. It never reads `cardinalities`, `optimizer`, `costs` or
 * `explanation`, which give away the answer.
 */
import type { Column, ColumnStats, JoinMethod, Level, Lock, Table } from '../engine/index.ts';
import { el } from './dom.ts';
import { formatCorrelation, formatCount, formatShare, formatValue } from './format.ts';

const METHODS: Readonly<Record<JoinMethod, string>> = {
  hash: 'a hash join',
  nestedLoop: 'a nested loop',
  merge: 'a merge join',
  indexNestedLoop: 'an index nested loop',
};

const code = (text: string): HTMLElement => el('code', {}, text);

function section(title: string, ...children: readonly Node[]): HTMLElement {
  return el('section', { class: 'part' }, el('h3', {}, title), ...children);
}

function list(items: readonly (readonly (Node | string)[])[]): HTMLElement {
  return el('ul', {}, ...items.map((item) => el('li', {}, ...item)));
}

/** A one-line summary of a table: its rows and how they are stored. */
function storage({ rows, storedOrder }: Table): HTMLElement {
  return el(
    'p',
    {},
    `${formatCount(rows)} rows, `,
    ...(storedOrder === null
      ? ['in no particular order.']
      : ['stored in order of ', code(storedOrder), '.']),
  );
}

function stats(
  column: string,
  { nullFraction, distinct, mostCommon, histogram, correlation }: ColumnStats,
): HTMLElement {
  const facts: [string, string][] = [
    ['Distinct values', formatCount(distinct)],
    ['Nulls', formatShare(nullFraction)],
    ...(correlation === null
      ? []
      : [
          ['Correlation with the stored order', formatCorrelation(correlation)] as [string, string],
        ]),
  ];
  const first = histogram[0];
  const last = histogram.at(-1);
  return el(
    'div',
    { class: 'stats' },
    el('h5', {}, 'Statistics on ', code(column)),
    el('dl', {}, ...facts.flatMap(([term, value]) => [el('dt', {}, term), el('dd', {}, value)])),
    ...(mostCommon.length === 0
      ? []
      : [
          el(
            'table',
            {},
            el('caption', {}, 'Most common values'),
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                el('th', { scope: 'col' }, 'Value'),
                el('th', { scope: 'col' }, 'Share of rows'),
              ),
            ),
            el(
              'tbody',
              {},
              ...mostCommon.map(({ value, frequency }) =>
                el(
                  'tr',
                  {},
                  el('td', {}, code(formatValue(value))),
                  el('td', {}, formatShare(frequency)),
                ),
              ),
            ),
          ),
        ]),
    ...(first === undefined || last === undefined
      ? []
      : [
          el(
            'p',
            {},
            `The other values are split into ${formatCount(histogram.length - 1)} ranges with the same number of rows, from `,
            code(formatValue(first)),
            ' to ',
            code(formatValue(last)),
            '.',
          ),
        ]),
  );
}

function table(t: Table): HTMLElement {
  const withStats = t.columns.filter(
    (column): column is Column & { stats: ColumnStats } => column.stats !== null,
  );
  return el(
    'section',
    { class: 'table', 'aria-labelledby': `table-${t.name}` },
    el('h4', { id: `table-${t.name}` }, code(t.name)),
    storage(t),
    ...(t.filter === null ? [] : [el('p', {}, 'Filter: ', code(t.filter))]),
    el('p', { class: 'label' }, 'Columns'),
    list(t.columns.map(({ name, type }) => [code(name), ` ${type}`])),
    el('p', { class: 'label' }, 'Indexes'),
    t.indexes.length === 0
      ? el('p', {}, 'None.')
      : list(t.indexes.map(({ name, column }) => [code(name), ' on ', code(column)])),
    ...withStats.map((column) => stats(column.name, column.stats)),
  );
}

function lock(item: Lock): (Node | string)[] {
  switch (item.kind) {
    case 'joinOrder':
      return [
        'The tables are joined in this order: ',
        ...item.tables.flatMap((name, i) => [...(i === 0 ? [] : [', then ']), code(name)]),
        '.',
      ];
    case 'joinMethod':
      return [`Every join is ${METHODS[item.method]}.`];
    case 'access':
      return item.scan.access === 'seq'
        ? [code(item.scan.table), ' is read with a seq scan.']
        : [code(item.scan.table), ' is read through ', code(item.scan.index), '.'];
  }
}

/** The level's story, query, tables, joins and locks. */
export function renderLevel(level: Level): HTMLElement {
  const ref = ({ table: name, column }: { table: string; column: string }): string =>
    `${name}.${column}`;
  return el(
    'article',
    { class: 'level', 'aria-labelledby': 'level-title' },
    el('h2', { id: 'level-title' }, level.title),
    ...level.story.map((paragraph) => el('p', { class: 'story' }, paragraph)),
    section('The query', el('pre', { class: 'sql' }, code(level.sql))),
    section(level.tables.length === 1 ? 'The table' : 'The tables', ...level.tables.map(table)),
    ...(level.joins.length === 0
      ? []
      : [
          section(
            'Joins',
            list(level.joins.map(({ left, right }) => [code(`${ref(left)} = ${ref(right)}`)])),
          ),
        ]),
    ...(level.orderBy === null
      ? []
      : [
          section(
            'Order',
            el('p', {}, 'The result is sorted by ', code(ref(level.orderBy)), ', ascending.'),
          ),
        ]),
    ...(level.locks.length === 0
      ? []
      : [section('Fixed for this level', list(level.locks.map(lock)))]),
  );
}

// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LAUNCH_DATE } from '../daily.ts';
import type { Level } from '../engine/index.ts';
import { KEY, type Progress } from '../progress.ts';
import { SITE_TITLE, formatDate, start } from './app.ts';

const needle = JSON.parse(readFileSync('levels/needle.json', 'utf8')) as Level;

/** An in-memory localStorage. */
function memoryStorage(initial?: Progress): Storage {
  const items = new Map<string, string>();
  if (initial !== undefined) items.set(KEY, JSON.stringify(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } as Storage;
}

const seen: Progress = { tutorialSeen: true, puzzles: {}, streak: { last: 0, days: 0 } };

/** Noon on the day `days` after the launch. */
const day = (days: number): (() => Date) => {
  const [y = 0, m = 0, d = 0] = LAUNCH_DATE.split('-').map(Number);
  return () => new Date(y, m - 1, d + days, 12);
};

const text = (node: Element | null | undefined): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

function chooseSeqScan(root: HTMLElement): void {
  const seq = [...root.querySelectorAll('input')].find(({ value }) => value === 'seq');
  if (seq === undefined) throw new Error('no seq scan option');
  seq.checked = true;
  seq.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('start', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.title = SITE_TITLE;
    root = document.createElement('main');
    document.body.replaceChildren(root);
  });

  it('shows today’s puzzle, its number, the date and the streak', async () => {
    await start(root, '', { now: day(0), storage: memoryStorage(seen) });
    expect(root.querySelector('h2')?.textContent).toBe('Needle');
    expect(root.querySelector('#builder-title')?.textContent).toBe('Your plan');
    expect(root.querySelector('#run-title')?.textContent).toBe('Run it');
    expect(text(root.querySelector('.puzzle p'))).toBe(
      'Puzzle #1 · Tuesday, December 1, 2026 · Streak: 0 days',
    );
    expect(document.title).toBe('Needle · Beat the Optimizer');
    expect(root.hasAttribute('aria-busy')).toBe(false);
  });

  it('rotates through the levels day by day', async () => {
    await start(root, '', { now: day(2), storage: memoryStorage(seen) });
    expect(root.querySelector('h2')?.textContent).toBe('Haystack');
    expect(text(root.querySelector('.puzzle p'))).toContain(
      'Puzzle #3 · Thursday, December 3, 2026',
    );
  });

  it('records each run of today’s puzzle and the streak', async () => {
    const storage = memoryStorage({ ...seen, streak: { last: 1, days: 1 } });
    await start(root, '', { now: day(1), storage });
    chooseSeqScan(root);
    root.querySelector<HTMLButtonElement>('.run-button')?.click();
    expect(JSON.parse(String(storage.getItem(KEY)))).toEqual({
      ...seen,
      puzzles: { '2': { runs: 1, best: 100_000 } },
      streak: { last: 2, days: 2 },
    });
    expect(text(root.querySelector('.puzzle p'))).toContain('Streak: 2 days');
  });

  it('remembers the runs already used today', async () => {
    const storage = memoryStorage({ ...seen, puzzles: { '1': { runs: 4, best: 1 } } });
    await start(root, '', { now: day(0), storage });
    chooseSeqScan(root);
    expect(root.querySelector<HTMLButtonElement>('.run-button')?.disabled).toBe(true);
    expect(text(root.querySelector('.run-controls p'))).toBe('No runs left for this puzzle.');
  });

  it('says “1 day” for a streak of one', async () => {
    const storage = memoryStorage({ ...seen, streak: { last: 1, days: 1 } });
    await start(root, '', { now: day(0), storage });
    expect(text(root.querySelector('.puzzle p'))).toContain('Streak: 1 day');
  });

  it('shows the tutorial on the first visit only', async () => {
    const storage = memoryStorage();
    await start(root, '', { now: day(0), storage });
    const dialog = root.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    dialog?.querySelector('button')?.click();
    expect(dialog?.open).toBe(false);
    expect(JSON.parse(String(storage.getItem(KEY)))).toMatchObject({ tutorialSeen: true });

    const again = document.createElement('main');
    document.body.append(again);
    await start(again, '', { now: day(0), storage });
    expect(again.querySelector('dialog')?.open).toBe(false);
    [...again.querySelectorAll('button')].find((b) => b.textContent === 'How to play')?.click();
    expect(again.querySelector('dialog')?.open).toBe(true);
  });

  it('plays a level for practice, without counting it', async () => {
    const storage = memoryStorage(seen);
    await start(root, '?level=signed-copies', { now: day(0), storage });
    expect(root.querySelector('h2')?.textContent).toBe('Signed copies');
    expect(text(root.querySelector('.puzzle p'))).toBe(
      'Practice: this is not today’s puzzle, and it does not count towards your streak. Play today’s puzzle.',
    );
    expect(root.querySelector('.puzzle a')?.getAttribute('href')).toBe('./');
    expect(JSON.parse(String(storage.getItem(KEY)))).toEqual(seen);
  });

  it('works without storage', async () => {
    await start(root, '', { now: day(0), storage: null });
    expect(root.querySelector('h2')?.textContent).toBe('Needle');
    expect(root.querySelector('dialog')?.open).toBe(true);
    root.querySelector<HTMLButtonElement>('dialog button')?.click();
    chooseSeqScan(root);
    root.querySelector<HTMLButtonElement>('.run-button')?.click();
    expect(text(root.querySelector('.puzzle p'))).toContain('Streak: 1 day');
  });

  it('works when storage throws', async () => {
    const broken = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    } as unknown as Storage;
    await start(root, '', { now: day(0), storage: broken });
    root.querySelector<HTMLButtonElement>('dialog button')?.click();
    chooseSeqScan(root);
    root.querySelector<HTMLButtonElement>('.run-button')?.click();
    expect(text(root.querySelector('.run-controls p'))).toContain('3 of 4 runs left.');
  });

  it('says so when there is no such level, with a link to today’s puzzle', async () => {
    await start(root, '?level=nope', { storage: null });
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'There is no level called “nope”. Play today’s puzzle.',
    );
    expect(root.querySelector('a')?.getAttribute('href')).toBe('./');
    expect(document.title).toBe(SITE_TITLE);
  });

  it('says so when the level cannot be loaded', async () => {
    const loaders = new Map([['needle', () => Promise.reject(new Error('offline'))]]);
    await start(root, '', { loaders, now: day(0), storage: null });
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'The level could not be loaded. Check your connection and reload the page.',
    );
    expect(root.hasAttribute('aria-busy')).toBe(false);
  });

  it('is busy while the level loads', async () => {
    let busy: string | null = null;
    const loaders = new Map([
      [
        'needle',
        () => {
          busy = root.getAttribute('aria-busy');
          return Promise.resolve(needle);
        },
      ],
    ]);
    await start(root, '', { loaders, now: day(0), storage: null });
    expect(busy).toBe('true');
  });
});

describe('formatDate', () => {
  it('writes a date in full, the same in every time zone', () => {
    expect(formatDate('2027-01-01')).toBe('Friday, January 1, 2027');
  });
});

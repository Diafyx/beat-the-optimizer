import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LAUNCH_DATE, ROTATION, dailyPuzzle, daysBetween, localDate } from './daily.ts';
import { LEVEL_IDS } from './levels.ts';

// New York changes the clocks on 8 March and 1 November 2026, so those days
// have 23 and 25 hours. Node applies a change of TZ at once.
const zone = process.env['TZ'];
beforeAll(() => {
  process.env['TZ'] = 'America/New_York';
});
afterAll(() => {
  if (zone === undefined) Reflect.deleteProperty(process.env, 'TZ');
  else process.env['TZ'] = zone;
});

/** Local time in New York. */
const at = (y: number, m: number, d: number, h = 12, min = 0): Date =>
  new Date(y, m - 1, d, h, min);

describe('localDate', () => {
  it('is the calendar date where the player is', () => {
    expect(localDate(at(2026, 12, 31, 23, 59))).toBe('2026-12-31');
    expect(localDate(at(2027, 1, 1, 0, 0))).toBe('2027-01-01');
    // 04:59 UTC on 1 January is still New Year's Eve in New York.
    expect(localDate(new Date(Date.UTC(2027, 0, 1, 4, 59)))).toBe('2026-12-31');
  });
});

describe('daysBetween', () => {
  it('counts calendar days across months, years and leap days', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2026-12-01', '2027-12-01')).toBe(365);
    expect(daysBetween('2026-12-02', '2026-12-01')).toBe(-1);
  });
});

describe('dailyPuzzle', () => {
  it('starts at puzzle #1 on the launch date, and stays there before it', () => {
    const [y = 0, m = 0, d = 0] = LAUNCH_DATE.split('-').map(Number);
    expect(dailyPuzzle(at(y, m, d, 0, 0))).toEqual({
      number: 1,
      date: LAUNCH_DATE,
      level: 'needle',
    });
    expect(dailyPuzzle(at(y, m, d - 30)).number).toBe(1);
  });

  it('goes through the levels in order, then starts again', () => {
    const days = Array.from({ length: 2 * LEVEL_IDS.length + 1 }, (_, i) =>
      dailyPuzzle(at(2026, 11, 23 + i)),
    );
    expect(days.map(({ number }) => number)).toEqual(days.map((_, i) => i + 1));
    expect(days.map(({ level }) => level)).toEqual([...LEVEL_IDS, ...LEVEL_IDS, LEVEL_IDS[0]]);
    expect(ROTATION).toEqual(LEVEL_IDS);
  });

  it('keeps the levels of puzzles already played when levels are added (#122)', () => {
    const levels = Array.from({ length: 15 }, (_, i) => dailyPuzzle(at(2026, 11, 23 + i)).level);
    expect(levels).toEqual([
      'needle',
      'read-the-stats',
      'haystack',
      'pick-your-index',
      'one-customer',
      'every-shipped-order',
      'in-order',
      'signed-copies',
      'belt-and-braces',
      'last-nights-migration',
      'a-short-list',
      'filed-by-date',
      'sorting-is-cheap',
      'read-it-whole',
      'start-in-the-middle',
    ]);
    expect(dailyPuzzle(at(2026, 12, 3)).number).toBe(11);
  });

  it('changes puzzle at local midnight across a month and a year', () => {
    const number = (date: Date): number => dailyPuzzle(date, '2026-12-01').number;
    expect(number(at(2026, 12, 31, 23, 59))).toBe(31);
    expect(number(at(2027, 1, 1, 0, 0))).toBe(32);
    expect(number(at(2027, 1, 31, 23, 59))).toBe(62);
    expect(number(at(2027, 2, 1, 0, 0))).toBe(63);
  });

  it.each([
    ['the clocks go forward', 3, 8],
    ['the clocks go back', 11, 1],
  ])('gives one puzzle per calendar day when %s', (_, month, day) => {
    const launch = '2026-01-01';
    const puzzle = (h: number, min: number, d = day): number =>
      dailyPuzzle(at(2026, month, d, h, min), launch).number;
    const today = puzzle(0, 0);
    expect(puzzle(0, 0, day - 1)).toBe(today - 1);
    expect(puzzle(23, 59, day - 1)).toBe(today - 1);
    expect(puzzle(1, 30)).toBe(today);
    expect(puzzle(3, 30)).toBe(today);
    expect(puzzle(23, 59)).toBe(today);
    expect(puzzle(0, 0, day + 1)).toBe(today + 1);
    // The day really is not 24 hours long here.
    const length = at(2026, month, day + 1, 0, 0).getTime() - at(2026, month, day, 0, 0).getTime();
    expect(length / 3_600_000).not.toBe(24);
  });
});

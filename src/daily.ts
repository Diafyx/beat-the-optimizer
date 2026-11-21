/**
 * The puzzle of the day: the same for everyone on the same calendar date.
 * Days are counted between calendar dates, never by subtracting times, so a
 * day with a daylight-saving change is still one day.
 */
import { LEVEL_IDS } from './levels.ts';

/** The date of puzzle #1. */
export const LAUNCH_DATE = '2026-12-01';

/** The levels in the order the days go through them, then again from the start. */
export const ROTATION: readonly string[] = LEVEL_IDS;

const DAY_MS = 86_400_000;

/** A calendar date as a day count, from its year, month and day alone. */
const dayOf = (year: number, month: number, day: number): number =>
  Date.UTC(year, month - 1, day) / DAY_MS;

/** The local calendar date of `now`, as YYYY-MM-DD. */
export function localDate(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const [fy = 0, fm = 0, fd = 0] = from.split('-').map(Number);
  const [ty = 0, tm = 0, td = 0] = to.split('-').map(Number);
  return dayOf(ty, tm, td) - dayOf(fy, fm, fd);
}

export interface Daily {
  /** Days since the launch, plus one; puzzle #1 until the launch. */
  readonly number: number;
  /** The player's local date, YYYY-MM-DD. */
  readonly date: string;
  readonly level: string;
}

/** Today's puzzle, for the player's local date at `now`. */
export function dailyPuzzle(
  now: Date,
  launch: string = LAUNCH_DATE,
  rotation: readonly string[] = ROTATION,
): Daily {
  const date = localDate(now);
  const number = Math.max(daysBetween(launch, date), 0) + 1;
  return { number, date, level: String(rotation[(number - 1) % rotation.length]) };
}

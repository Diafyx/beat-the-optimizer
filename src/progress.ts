/**
 * The player's progress, kept in localStorage. Storage can be missing, full or
 * blocked (private browsing, disabled cookies), so every access is guarded:
 * without it the game still works, and forgets on reload.
 */

/** What the player did on one daily puzzle. */
export interface PuzzleProgress {
  /** The cost of each run, in order. */
  readonly costs: readonly number[];
}

export interface Progress {
  readonly tutorialSeen: boolean;
  /** By puzzle number. */
  readonly puzzles: Readonly<Record<string, PuzzleProgress>>;
  /** The last puzzle played and how many days in a row led up to it. */
  readonly streak: { readonly last: number; readonly days: number };
}

export const KEY = 'beat-the-optimizer:v1';

export const EMPTY: Progress = { tutorialSeen: false, puzzles: {}, streak: { last: 0, days: 0 } };

/** The storage to use, or null if the browser refuses access to it. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function parse(text: string): Progress {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || !isRecord(data['puzzles']) || !isRecord(data['streak'])) return EMPTY;
  const { last, days } = data['streak'];
  const puzzles = Object.entries(data['puzzles']).filter(
    (entry): entry is [string, PuzzleProgress] => {
      const costs = isRecord(entry[1]) ? entry[1]['costs'] : undefined;
      return Array.isArray(costs) && costs.every(isCount);
    },
  );
  return {
    tutorialSeen: data['tutorialSeen'] === true,
    puzzles: Object.fromEntries(puzzles.map(([n, { costs }]) => [n, { costs: [...costs] }])),
    streak: isCount(last) && isCount(days) ? { last, days } : EMPTY.streak,
  };
}

/** The saved progress, or none if there is none, it is unreadable or storage is blocked. */
export function loadProgress(storage: Storage | null = browserStorage()): Progress {
  try {
    const text = storage?.getItem(KEY);
    return typeof text === 'string' ? parse(text) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Saves `progress`; does nothing if storage is blocked or full. */
export function saveProgress(progress: Progress, storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(progress));
  } catch {
    // The game goes on without saving.
  }
}

/** `progress` after a run of daily puzzle `number` that cost `cost`. */
export function recordRun(progress: Progress, number: number, cost: number): Progress {
  const before = progress.puzzles[String(number)];
  const { last, days } = progress.streak;
  return {
    ...progress,
    puzzles: {
      ...progress.puzzles,
      [String(number)]: { costs: [...(before?.costs ?? []), cost] },
    },
    streak:
      last === number
        ? progress.streak
        : { last: number, days: last === number - 1 ? days + 1 : 1 },
  };
}

/** The streak shown on puzzle `today`: it lasts while yesterday's puzzle was played. */
export const currentStreak = ({ streak }: Progress, today: number): number =>
  streak.last >= today - 1 ? streak.days : 0;

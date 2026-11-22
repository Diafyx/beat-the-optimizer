// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY,
  KEY,
  browserStorage,
  currentStreak,
  loadProgress,
  recordRun,
  saveProgress,
  type Progress,
} from './progress.ts';

function storageWith(text: string | null): Storage {
  const items = new Map<string, string>(text === null ? [] : [[KEY, text]]);
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } as Storage;
}

const saved: Progress = {
  tutorialSeen: true,
  puzzles: { '3': { costs: [9000, 6600] } },
  streak: { last: 3, days: 2 },
  firstFinish: '2026-12-02',
  sent: ['first_finish'],
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('loadProgress and saveProgress', () => {
  it('round-trips through storage', () => {
    const storage = storageWith(null);
    expect(loadProgress(storage)).toEqual(EMPTY);
    saveProgress(saved, storage);
    expect(loadProgress(storage)).toEqual(saved);
  });

  it('uses localStorage by default', () => {
    saveProgress(saved);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(saved));
    expect(loadProgress()).toEqual(saved);
  });

  it('starts afresh from unreadable or malformed progress', () => {
    for (const text of ['{', '[]', 'null', '{"puzzles":{}}', '{"puzzles":[],"streak":{}}']) {
      expect(loadProgress(storageWith(text))).toEqual(EMPTY);
    }
  });

  it('keeps the valid parts of progress and drops the rest', () => {
    const text = JSON.stringify({
      tutorialSeen: 'yes',
      puzzles: { '1': { costs: [5, 3] }, '2': { costs: [-1] }, '3': 7, '4': { runs: 1 } },
      streak: { last: 1.5, days: 1 },
      firstFinish: 'yesterday',
      sent: ['return_d1', 3],
      extra: true,
    });
    expect(loadProgress(storageWith(text))).toEqual({
      ...EMPTY,
      puzzles: { '1': { costs: [5, 3] } },
      sent: ['return_d1'],
    });
    const other = JSON.stringify({ puzzles: {}, streak: {}, firstFinish: 20261201, sent: {} });
    expect(loadProgress(storageWith(other))).toEqual(EMPTY);
  });

  it('carries on when storage is missing, blocked or full', () => {
    const broken = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    } as unknown as Storage;
    expect(loadProgress(broken)).toEqual(EMPTY);
    expect(() => {
      saveProgress(saved, broken);
    }).not.toThrow();
    expect(loadProgress(null)).toEqual(EMPTY);
    expect(() => {
      saveProgress(saved, null);
    }).not.toThrow();
  });

  it('has no storage when the browser refuses access to it', () => {
    expect(browserStorage()).toBe(localStorage);
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    expect(browserStorage()).toBeNull();
  });
});

describe('recordRun', () => {
  it('keeps the cost of each run, in order', () => {
    const once = recordRun(EMPTY, 5, 300);
    expect(once.puzzles).toEqual({ '5': { costs: [300] } });
    expect(recordRun(once, 5, 200).puzzles).toEqual({ '5': { costs: [300, 200] } });
  });

  it('grows the streak on consecutive days and restarts it after a gap', () => {
    const day1 = recordRun(EMPTY, 1, 10);
    expect(day1.streak).toEqual({ last: 1, days: 1 });
    expect(recordRun(day1, 1, 10).streak).toEqual({ last: 1, days: 1 });
    const day2 = recordRun(day1, 2, 10);
    expect(day2.streak).toEqual({ last: 2, days: 2 });
    expect(recordRun(day2, 4, 10).streak).toEqual({ last: 4, days: 1 });
  });
});

describe('currentStreak', () => {
  it('lasts while yesterday’s puzzle was played', () => {
    expect(currentStreak(saved, 3)).toBe(2);
    expect(currentStreak(saved, 4)).toBe(2);
    expect(currentStreak(saved, 5)).toBe(0);
    expect(currentStreak(EMPTY, 1)).toBe(0);
  });
});

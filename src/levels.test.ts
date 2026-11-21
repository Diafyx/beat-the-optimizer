import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Level } from './engine/index.ts';
import { LEVEL_FILES, LEVEL_IDS, loadLevel } from './levels.ts';

describe('levels', () => {
  it('lists every level file once, and nothing else', () => {
    const files = readdirSync('levels')
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''));
    expect([...LEVEL_IDS].sort()).toEqual(files.sort());
    expect(new Set(LEVEL_IDS).size).toBe(LEVEL_IDS.length);
    expect([...LEVEL_FILES.keys()].sort()).toEqual(files.sort());
  });

  it('loads each level, whose id is its file name', async () => {
    for (const id of LEVEL_IDS) {
      expect((await loadLevel(id))?.id).toBe(id);
    }
  });

  it('has no level for an unknown id', async () => {
    expect(await loadLevel('no-such-level')).toBeUndefined();
  });

  it('loads only listed levels, even if a file exists', async () => {
    const level = { id: 'draft' } as Level;
    const loaders = new Map([['draft', () => Promise.resolve(level)]]);
    expect(await loadLevel('draft', loaders)).toBeUndefined();
  });

  it('has no level for a listed id without a file', async () => {
    expect(await loadLevel('needle', new Map())).toBeUndefined();
  });
});

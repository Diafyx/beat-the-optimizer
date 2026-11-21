/**
 * The game's levels. Each level file becomes its own chunk, loaded only when
 * it is played. The files are checked in CI (`npm run levels`), so the app
 * trusts their shape.
 */
import type { Level } from './engine/index.ts';

/** Every level, in the order the game introduces them. */
export const LEVEL_IDS = [
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
] as const;

export type LevelLoader = () => Promise<Level>;

const files = import.meta.glob<Level>('../levels/*.json', { import: 'default' });

/** A loader for each level file, by its id (the file name without `.json`). */
export const LEVEL_FILES: ReadonlyMap<string, LevelLoader> = new Map(
  Object.entries(files).map(([path, load]) => [path.replace(/^.*\/|\.json$/g, ''), load]),
);

/** The level with this id, or undefined if there is none. */
export async function loadLevel(
  id: string,
  loaders: ReadonlyMap<string, LevelLoader> = LEVEL_FILES,
): Promise<Level | undefined> {
  const load = (LEVEL_IDS as readonly string[]).includes(id) ? loaders.get(id) : undefined;
  return load === undefined ? undefined : load();
}

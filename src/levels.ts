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
  // Added for puzzles #11 to #15 (#122). New levels go at the end, so the
  // earlier puzzles keep their levels.
  'a-short-list',
  'filed-by-date',
  'sorting-is-cheap',
  'read-it-whole',
  'start-in-the-middle',
  // Added for puzzles #16 to #20 (#124).
  'big-table-first',
  'sort-the-few',
  'oldest-first',
  'flagged-overnight',
  'keep-the-order',
  // Added for puzzles #21 to #23 (#128).
  'the-big-customer',
  'refunds-first',
  'said-twice',
  // Added for puzzles #24 to #27 (#132).
  'goes-together',
  'never-together',
  'books-in-kronur',
  'every-order-every-ticket',
  // Added for puzzles #28 to #30 (#133).
  'in-any-case',
  'in-cents',
  'two-guesses',
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

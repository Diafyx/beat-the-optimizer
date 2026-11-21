/**
 * The app shell: picks the level from the address, loads it and shows it in
 * `root`. Until the daily rotation (#24), `?level=<id>` picks a level and the
 * first level is the default.
 */
import { FIRST_LEVEL, LEVEL_FILES, loadLevel, type LevelLoader } from '../levels.ts';
import { el } from './dom.ts';
import { renderLevel } from './level-view.ts';

export const SITE_TITLE = 'Beat the Optimizer';

function message(...children: readonly (Node | string)[]): HTMLElement {
  return el('p', { class: 'message', role: 'alert' }, ...children);
}

/** Shows the level that `search` (such as `?level=needle`) names in `root`. */
export async function start(
  root: HTMLElement,
  search: string,
  loaders: ReadonlyMap<string, LevelLoader> = LEVEL_FILES,
): Promise<void> {
  const id = new URLSearchParams(search).get('level') ?? FIRST_LEVEL;
  root.setAttribute('aria-busy', 'true');
  try {
    const level = await loadLevel(id, loaders);
    if (level === undefined) {
      root.replaceChildren(
        message(
          `There is no level called “${id}”. `,
          el('a', { href: './' }, 'Play the first level'),
          '.',
        ),
      );
      return;
    }
    document.title = `${level.title} · ${SITE_TITLE}`;
    root.replaceChildren(renderLevel(level));
  } catch {
    root.replaceChildren(
      message('The level could not be loaded. Check your connection and reload the page.'),
    );
  } finally {
    root.removeAttribute('aria-busy');
  }
}

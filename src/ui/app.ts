/**
 * The app shell: shows today's puzzle, or with `?level=<id>` a level to
 * practise, with the player's streak and the first-run tutorial.
 */
import { dailyPuzzle, type Daily } from '../daily.ts';
import { LEVEL_FILES, loadLevel, type LevelLoader } from '../levels.ts';
import {
  browserStorage,
  currentStreak,
  loadProgress,
  recordRun,
  saveProgress,
  type Progress,
} from '../progress.ts';
import { el } from './dom.ts';
import { renderLevel } from './level-view.ts';
import { renderPlanBuilder } from './plan-builder.ts';
import { shareText } from '../share.ts';
import { renderRun } from './run.ts';
import { renderShare, type ShareTarget } from './share.ts';
import { renderTutorial } from './tutorial.ts';

export const SITE_TITLE = 'Beat the Optimizer';

const dates = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** A YYYY-MM-DD date for display, such as `Tuesday, December 1, 2026`. */
export const formatDate = (date: string): string => dates.format(new Date(`${date}T00:00:00Z`));

const days = (n: number): string => `${String(n)} ${n === 1 ? 'day' : 'days'}`;

function message(...children: readonly (Node | string)[]): HTMLElement {
  return el('p', { class: 'message', role: 'alert' }, ...children);
}

export interface AppOptions {
  readonly loaders?: ReadonlyMap<string, LevelLoader>;
  readonly now?: () => Date;
  readonly storage?: Storage | null;
  /** Where sharing goes; by default, `navigator`. */
  readonly shareTarget?: ShareTarget;
  /** The link in the share card; by default, this page without its query. */
  readonly url?: string;
}

/** Shows today's puzzle, or the level that `search` (such as `?level=needle`) names, in `root`. */
export async function start(
  root: HTMLElement,
  search: string,
  {
    loaders = LEVEL_FILES,
    now = () => new Date(),
    storage = browserStorage(),
    shareTarget = navigator,
    url = `${location.origin}${location.pathname}`,
  }: AppOptions = {},
): Promise<void> {
  const practice = new URLSearchParams(search).get('level');
  const daily: Daily | null = practice === null ? dailyPuzzle(now()) : null;
  const id = daily?.level ?? String(practice);
  let progress: Progress = loadProgress(storage);
  root.setAttribute('aria-busy', 'true');
  try {
    const level = await loadLevel(id, loaders);
    if (level === undefined) {
      root.replaceChildren(
        message(
          `There is no level called “${id}”. `,
          el('a', { href: './' }, 'Play today’s puzzle'),
          '.',
        ),
      );
      return;
    }
    document.title = `${level.title} · ${SITE_TITLE}`;
    const streak = el('span');
    const share = renderShare(shareTarget);
    const showShare = (): void => {
      const costs = daily === null ? [] : (progress.puzzles[String(daily.number)]?.costs ?? []);
      if (daily === null || costs.length === 0) return;
      const { optimizer, best } = level.costs;
      share.show(shareText({ puzzle: daily.number, costs, optimizer, best, url }));
    };
    const showStreak = (today: number): void => {
      streak.textContent = `Streak: ${days(currentStreak(progress, today))}`;
    };
    const run = renderRun(
      level,
      daily === null
        ? {}
        : {
            used: progress.puzzles[String(daily.number)]?.costs.length ?? 0,
            onRun: (cost) => {
              progress = recordRun(progress, daily.number, cost);
              saveProgress(progress, storage);
              showStreak(daily.number);
            },
            onResult: showShare,
          },
    );
    const tutorial = renderTutorial(() => {
      progress = { ...progress, tutorialSeen: true };
      saveProgress(progress, storage);
    });
    const help = el('button', { type: 'button', class: 'link-button' }, 'How to play');
    help.addEventListener('click', () => {
      tutorial.showModal();
    });
    if (daily !== null) showStreak(daily.number);
    const banner = el(
      'div',
      { class: 'puzzle' },
      daily === null
        ? el(
            'p',
            {},
            'Practice: this is not today’s puzzle, and it does not count towards your streak. ',
            el('a', { href: './' }, 'Play today’s puzzle'),
            '.',
          )
        : el('p', {}, `Puzzle #${String(daily.number)} · ${formatDate(daily.date)} · `, streak),
      help,
    );
    const view = renderLevel(level);
    view.append(
      renderPlanBuilder(level, (plan) => {
        run.setPlan(plan);
      }),
      run.element,
      share.element,
    );
    // A run earlier today: its result has been seen, so it can be shared.
    showShare();
    root.replaceChildren(banner, view, tutorial);
    if (!progress.tutorialSeen) tutorial.showModal();
  } catch {
    root.replaceChildren(
      message('The level could not be loaded. Check your connection and reload the page.'),
    );
  } finally {
    root.removeAttribute('aria-busy');
  }
}

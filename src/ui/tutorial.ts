/**
 * "How it works": a modal dialog that explains the game in three screens,
 * with Back, Next and Skip. It opens on the first visit and from a button.
 */
import { el, type Child } from './dom.ts';

interface Screen {
  readonly title: string;
  readonly text: string;
  readonly example: readonly Child[];
}

/** One line of an example: what a plan does, and the rows it touches. */
const line = (what: string, rows: string): HTMLElement =>
  el('li', {}, el('span', {}, what), ' ', el('b', {}, rows));

const SCREENS: readonly Screen[] = [
  {
    title: 'Every query needs a plan',
    text: 'When you ask a database for data, it has to decide how to get it: which table to read first, whether to read every row or jump straight to the right ones with an index, and how to match rows from two tables. That decision is called a plan.',
    example: [
      el('p', {}, 'Find order 42 among 100,000 orders.'),
      el(
        'ul',
        { class: 'example' },
        line('Read every row', '100,000 rows'),
        line('Jump to it with an index', '1 row'),
      ),
    ],
  },
  {
    title: 'Meet the Optimizer',
    text: 'Every database has an Optimizer: the part that picks the plan. This game uses PostgreSQL’s. It can’t count rows before it starts, so it guesses from statistics it keeps about each table. When a guess is wrong, it can pick a slow plan.',
    example: [
      el(
        'p',
        { class: 'flag' },
        'The Optimizer guessed ',
        el('b', {}, '10 rows'),
        '. There were ',
        el('b', {}, '50,000'),
        '.',
      ),
    ],
  },
  {
    title: 'Your turn',
    text: 'Answer a few questions to build your own plan, then race it against the Optimizer’s. Every row a plan touches scores points. Fewer points wins, like golf. You get four races a day, and a new puzzle every day.',
    example: [],
  },
];

/** The dialog. `onClose` runs each time it closes, however it closes. */
export function renderTutorial(onClose: () => void): HTMLDialogElement {
  let current = 0;
  const step = el('p', { class: 'step' });
  const screens = SCREENS.map(({ title, text, example }) =>
    el('div', { class: 'screen' }, el('h2', {}, title), el('p', {}, text), ...example),
  );
  const back = el('button', { type: 'button', class: 'back-button' }, 'Back');
  const skip = el('button', { type: 'button', class: 'link-button' }, 'Skip');
  const next = el('button', { type: 'button', class: 'run-button', autofocus: '' });
  const dialog = el(
    'dialog',
    { class: 'tutorial', 'aria-labelledby': 'tutorial-title' },
    el('p', { id: 'tutorial-title', class: 'tag' }, 'How it works'),
    step,
    el('div', { 'aria-live': 'polite' }, ...screens),
    el('div', { class: 'tutorial-buttons' }, back, skip, next),
  );

  const show = (index: number): void => {
    current = index;
    screens.forEach((screen, i) => {
      screen.hidden = i !== index;
    });
    step.textContent = `${String(index + 1)} of ${String(SCREENS.length)}`;
    // A disabled button loses the focus, so it moves to Next.
    if (index === 0 && document.activeElement === back) next.focus();
    back.disabled = index === 0;
    next.textContent = index === SCREENS.length - 1 ? 'Let’s race' : 'Next';
  };

  back.addEventListener('click', () => {
    show(current - 1);
  });
  next.addEventListener('click', () => {
    if (current === SCREENS.length - 1) dialog.close();
    else show(current + 1);
  });
  skip.addEventListener('click', () => {
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    show(0);
    onClose();
  });
  show(0);
  return dialog;
}

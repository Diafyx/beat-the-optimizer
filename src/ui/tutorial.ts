/** The first-run tutorial: a modal dialog with the rules in four steps. */
import { el } from './dom.ts';

export function renderTutorial(onClose: () => void): HTMLDialogElement {
  const close = el('button', { type: 'button', class: 'run-button' }, 'Start playing');
  const dialog = el(
    'dialog',
    { class: 'tutorial', 'aria-labelledby': 'tutorial-title' },
    el('h2', { id: 'tutorial-title' }, 'How to play'),
    el(
      'ol',
      {},
      el('li', {}, 'Read the query and its tables: their sizes, indexes and statistics.'),
      el(
        'li',
        {},
        'Build a plan: which table to read first, how to read each table, and how to join them.',
      ),
      el(
        'li',
        {},
        'Run it. Every step costs the rows it touches, and the cost is compared with the plan PostgreSQL chose.',
      ),
      el('li', {}, 'Beat PostgreSQL, or match the best plan. You have four runs a day.'),
    ),
    el('p', {}, 'A new puzzle comes out every day.'),
    close,
  );
  close.addEventListener('click', () => {
    dialog.close();
  });
  dialog.addEventListener('close', onClose);
  return dialog;
}

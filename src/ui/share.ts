/**
 * Sharing the result: the system share sheet where there is one (most
 * phones), otherwise the clipboard. The card is shown too, so it can be
 * copied by hand if both fail.
 */
import { el } from './dom.ts';

/** The parts of `navigator` that sharing uses. */
export interface ShareTarget {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly canShare?: (data: ShareData) => boolean;
  readonly clipboard?: { writeText(text: string): Promise<void> };
}

export interface ShareView {
  readonly element: HTMLElement;
  /** Shows `text` as the card to share. */
  show(text: string): void;
}

export function renderShare(target: ShareTarget = navigator): ShareView {
  let text = '';
  const card = el('pre', { class: 'card' });
  const button = el('button', { type: 'button', class: 'run-button' }, 'Share your result');
  const status = el('p', { role: 'status' });
  const element = el(
    'section',
    { class: 'part share', 'aria-labelledby': 'share-title', hidden: '' },
    el('h3', { id: 'share-title' }, 'Share'),
    el('p', {}, 'Your result, without your plan, so it spoils nothing:'),
    card,
    button,
    status,
  );

  async function copy(): Promise<void> {
    try {
      await target.clipboard?.writeText(text);
      status.textContent =
        target.clipboard === undefined
          ? 'Select the card above to copy it.'
          : 'Copied your result to the clipboard.';
    } catch {
      status.textContent = 'Could not copy. Select the card above to copy it.';
    }
  }

  async function share(): Promise<void> {
    status.textContent = '';
    const data = { text };
    if (target.share === undefined || target.canShare?.(data) === false) {
      await copy();
      return;
    }
    try {
      await target.share(data);
    } catch (error) {
      // The player closed the share sheet: nothing to do.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      await copy();
    }
  }

  button.addEventListener('click', () => {
    void share();
  });

  return {
    element,
    show(next) {
      text = next;
      card.textContent = next;
      element.hidden = false;
    },
  };
}

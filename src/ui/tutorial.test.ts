// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTutorial } from './tutorial.ts';

const text = (node: Element | null): string =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The screen on show. */
const shown = (dialog: HTMLDialogElement, selector: string): Element | null =>
  dialog.querySelector(`.screen:not([hidden]) ${selector}`);

function button(dialog: HTMLDialogElement, name: string): HTMLButtonElement {
  const found = [...dialog.querySelectorAll('button')].find((b) => b.textContent === name);
  if (found === undefined) throw new Error(`no ${name} button`);
  return found;
}

describe('renderTutorial', () => {
  let dialog: HTMLDialogElement;
  let onClose: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    onClose = vi.fn<() => void>();
    dialog = renderTutorial(onClose);
    document.body.append(dialog);
    dialog.showModal();
  });

  afterEach(() => {
    dialog.remove();
  });

  it('is a dialog called How it works, on the first of three screens', () => {
    const label = document.getElementById(String(dialog.getAttribute('aria-labelledby')));
    expect(label?.textContent).toBe('How it works');
    expect(text(dialog.querySelector('.step'))).toBe('1 of 3');
    expect(text(shown(dialog, 'h2'))).toBe('Every query needs a plan');
    expect([...dialog.querySelectorAll('.screen:not([hidden]) .example li')].map(text)).toEqual([
      'Read every row 100,000 rows',
      'Jump to it with an index 1 row',
    ]);
    expect(button(dialog, 'Back').disabled).toBe(true);
    expect(button(dialog, 'Next').hasAttribute('autofocus')).toBe(true);
    expect(dialog.querySelectorAll('.screen')).toHaveLength(3);
    expect(dialog.querySelectorAll('.screen:not([hidden])')).toHaveLength(1);
    expect(dialog.querySelector('.screen')?.parentElement?.getAttribute('aria-live')).toBe(
      'polite',
    );
  });

  it('goes forward and back through the screens', () => {
    button(dialog, 'Next').click();
    expect(text(dialog.querySelector('.step'))).toBe('2 of 3');
    expect(text(shown(dialog, 'h2'))).toBe('Meet the Optimizer');
    expect(text(shown(dialog, '.flag'))).toBe('The Optimizer guessed 10 rows. There were 50,000.');
    expect(button(dialog, 'Back').disabled).toBe(false);

    button(dialog, 'Next').click();
    expect(text(dialog.querySelector('.step'))).toBe('3 of 3');
    expect(text(shown(dialog, 'h2'))).toBe('Your turn');
    expect(text(shown(dialog, 'p'))).toContain('Fewer points wins, like golf.');
    expect(dialog.querySelector('button.run-button')?.textContent).toBe('Let’s race');

    button(dialog, 'Back').click();
    expect(text(shown(dialog, 'h2'))).toBe('Meet the Optimizer');
    expect(dialog.querySelector('button.run-button')?.textContent).toBe('Next');
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves the focus to Next when Back is disabled under it', () => {
    button(dialog, 'Next').click();
    const back = button(dialog, 'Back');
    back.focus();
    back.click();
    expect(back.disabled).toBe(true);
    expect(document.activeElement).toBe(button(dialog, 'Next'));
  });

  it('keeps the focus where it is when it is not on Back', () => {
    button(dialog, 'Next').click();
    const skip = button(dialog, 'Skip');
    skip.focus();
    button(dialog, 'Back').click();
    expect(document.activeElement).toBe(skip);
  });

  it('closes from the last screen, and opens again on the first', () => {
    button(dialog, 'Next').click();
    button(dialog, 'Next').click();
    button(dialog, 'Let’s race').click();
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    dialog.showModal();
    expect(text(dialog.querySelector('.step'))).toBe('1 of 3');
    expect(button(dialog, 'Back').disabled).toBe(true);
  });

  it('closes from Skip on any screen', () => {
    button(dialog, 'Next').click();
    button(dialog, 'Skip').click();
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

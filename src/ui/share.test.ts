// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderShare, type ShareTarget } from './share.ts';

const status = (element: HTMLElement): string =>
  element.querySelector('[role="status"]')?.textContent ?? '';

async function clickShare(target: ShareTarget): Promise<HTMLElement> {
  const view = renderShare(target);
  view.show('Beat the Optimizer #1\n🟩');
  view.element.querySelector('button')?.click();
  await vi.waitFor(() => {
    expect(target.share === undefined && status(view.element) === '').toBe(false);
  });
  return view.element;
}

describe('renderShare', () => {
  it('is hidden until there is a result, then shows the card', () => {
    const view = renderShare({});
    expect(view.element.hidden).toBe(true);
    view.show('Beat the Optimizer #1\n🟩');
    expect(view.element.hidden).toBe(false);
    expect(view.element.querySelector('pre')?.textContent).toBe('Beat the Optimizer #1\n🟩');
  });

  it('opens the share sheet where there is one', async () => {
    const share = vi.fn(() => Promise.resolve());
    const writeText = vi.fn(() => Promise.resolve());
    const element = await clickShare({ share, canShare: () => true, clipboard: { writeText } });
    expect(share).toHaveBeenCalledWith({ text: 'Beat the Optimizer #1\n🟩' });
    expect(writeText).not.toHaveBeenCalled();
    expect(status(element)).toBe('');
  });

  it('does nothing more when the player closes the share sheet', async () => {
    const share = vi.fn(() => Promise.reject(new DOMException('closed', 'AbortError')));
    const writeText = vi.fn(() => Promise.resolve());
    const view = renderShare({ share, clipboard: { writeText } });
    view.show('card');
    view.element.querySelector('button')?.click();
    await vi.waitFor(() => {
      expect(share).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies to the clipboard when sharing fails', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const element = await clickShare({
      share: () => Promise.reject(new Error('not allowed')),
      clipboard: { writeText },
    });
    expect(writeText).toHaveBeenCalledWith('Beat the Optimizer #1\n🟩');
    expect(status(element)).toBe('Copied your result to the clipboard.');
  });

  it('copies to the clipboard when the text cannot be shared or there is no share sheet', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const share = vi.fn(() => Promise.resolve());
    await clickShare({ share, canShare: () => false, clipboard: { writeText } });
    const element = await clickShare({ clipboard: { writeText } });
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(status(element)).toBe('Copied your result to the clipboard.');
  });

  it('asks the player to copy the card when the clipboard fails or is missing', async () => {
    const failed = await clickShare({
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    expect(status(failed)).toBe('Could not copy. Select the card above to copy it.');
    const missing = await clickShare({});
    expect(status(missing)).toBe('Select the card above to copy it.');
  });
});

// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { appShareTarget, CANCELED, nativeShareTarget } from './native-share.ts';
import { renderShare } from './share.ts';

const status = (element: HTMLElement): string =>
  element.querySelector('[role="status"]')?.textContent ?? '';

/** Shows `card` and presses Share your result. */
function press(view: ReturnType<typeof renderShare>, card: string): void {
  view.show(card);
  view.element.querySelector('button')?.click();
}

describe('nativeShareTarget', () => {
  it('opens the share sheet with the card', async () => {
    const share = vi.fn(() => Promise.resolve({ activityType: 'com.whatsapp' }));
    const writeText = vi.fn(() => Promise.resolve());
    const view = renderShare(nativeShareTarget(share, { writeText }));
    press(view, 'Beat the Optimizer #1\n🟩');
    await vi.waitFor(() => {
      expect(share).toHaveBeenCalledWith({ text: 'Beat the Optimizer #1\n🟩' });
    });
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
    expect(status(view.element)).toBe('');
  });

  it('shows nothing when the player closes the share sheet', async () => {
    const share = vi.fn(() => Promise.reject(new Error(CANCELED)));
    const writeText = vi.fn(() => Promise.resolve());
    const view = renderShare(nativeShareTarget(share, { writeText }));
    press(view, 'card');
    await vi.waitFor(() => {
      expect(share).toHaveBeenCalled();
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
    expect(status(view.element)).toBe('');
  });

  it('copies to the clipboard when sharing fails', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    const target = nativeShareTarget(() => Promise.reject(new Error('No activity found')), {
      writeText,
    });
    const view = renderShare(target);
    press(view, 'card');
    await vi.waitFor(() => {
      expect(status(view.element)).toBe('Copied your result to the clipboard.');
    });
    expect(writeText).toHaveBeenCalledWith('card');
  });

  it('has no clipboard to fall back on without one', () => {
    expect(nativeShareTarget(vi.fn(), undefined).clipboard).toBeUndefined();
  });

  it('shares empty text when there is none', async () => {
    const share = vi.fn(() => Promise.resolve());
    await nativeShareTarget(share, undefined).share?.({});
    expect(share).toHaveBeenCalledWith({ text: '' });
  });
});

describe('appShareTarget', () => {
  it('shares through the plugin it loads, with the clipboard as the fallback', async () => {
    const share = vi.fn(() => Promise.resolve({}));
    const target = await appShareTarget(() => Promise.resolve({ Share: { share } }));
    await target.share?.({ text: 'card' });
    expect(share).toHaveBeenCalledWith({ text: 'card' });
    expect(target.clipboard).toBe(navigator.clipboard);
  });

  it('loads Capacitor’s Share plugin by default', async () => {
    const target = await appShareTarget();
    expect(target.share).toBeTypeOf('function');
  });
});

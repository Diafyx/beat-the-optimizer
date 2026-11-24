// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('main', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
    // The launch date, so that today's puzzle is the first level.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 23, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock('./ui/native-share.ts');
    vi.doUnmock('./ui/app.ts');
  });

  it('shares through Capacitor in the app build', async () => {
    vi.stubGlobal('__APP__', true);
    const shareTarget = { share: vi.fn(() => Promise.resolve()) };
    vi.doMock('./ui/native-share.ts', () => ({
      appShareTarget: () => Promise.resolve(shareTarget),
    }));
    const start = vi.fn(() => Promise.resolve());
    vi.doMock('./ui/app.ts', () => ({ start }));
    document.body.innerHTML = '<main id="app"></main>';
    await import('./main.ts');
    expect(start).toHaveBeenCalledWith(document.querySelector('#app'), '', { shareTarget });
  });

  it('starts the app in #app', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    await import('./main.ts');
    await vi.waitFor(() => {
      expect(document.querySelector('#app h2')?.textContent).toBe('Needle');
    });
  });

  it('does nothing when #app is missing', async () => {
    await import('./main.ts');
    expect(document.body.children).toHaveLength(0);
  });
});

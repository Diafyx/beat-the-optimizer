// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('main', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
    // The launch date, so that today's puzzle is the first level.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 11, 1, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
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

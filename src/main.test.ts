// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('main', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
  });

  it('renders the placeholder into #app', async () => {
    document.body.innerHTML = '<main id="app"></main>';
    await import('./main.ts');
    expect(document.querySelector('#app h1')?.textContent).toBe('Beat the Optimizer');
  });

  it('does nothing when #app is missing', async () => {
    await import('./main.ts');
    expect(document.body.children).toHaveLength(0);
  });
});

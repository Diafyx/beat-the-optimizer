// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Level } from '../engine/index.ts';
import { SITE_TITLE, start } from './app.ts';

const needle = JSON.parse(readFileSync('levels/needle.json', 'utf8')) as Level;

describe('start', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.title = SITE_TITLE;
    root = document.createElement('main');
  });

  it('shows the first level when the address names none', async () => {
    await start(root, '');
    expect(root.querySelector('h2')?.textContent).toBe('Needle');
    expect(root.querySelector('#builder-title')?.textContent).toBe('Your plan');
    expect(document.title).toBe('Needle · Beat the Optimizer');
    expect(root.hasAttribute('aria-busy')).toBe(false);
  });

  it('shows the level named by ?level=', async () => {
    await start(root, '?level=signed-copies');
    expect(root.querySelector('h2')?.textContent).toBe('Signed copies');
  });

  it('says so when there is no such level, with a link to the first', async () => {
    await start(root, '?level=nope');
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'There is no level called “nope”. Play the first level.',
    );
    expect(root.querySelector('a')?.getAttribute('href')).toBe('./');
    expect(document.title).toBe(SITE_TITLE);
  });

  it('says so when the level cannot be loaded', async () => {
    const loaders = new Map([['needle', () => Promise.reject(new Error('offline'))]]);
    await start(root, '', loaders);
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      'The level could not be loaded. Check your connection and reload the page.',
    );
    expect(root.hasAttribute('aria-busy')).toBe(false);
  });

  it('is busy while the level loads', async () => {
    let busy: string | null = null;
    const loaders = new Map([
      [
        'needle',
        () => {
          busy = root.getAttribute('aria-busy');
          return Promise.resolve(needle);
        },
      ],
    ]);
    await start(root, '', loaders);
    expect(busy).toBe('true');
    expect(root.querySelector('h2')?.textContent).toBe('Needle');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAGES, appSiteUrl, withAppLinks } from '../../scripts/lib/app-build.ts';

describe('withAppLinks', () => {
  it('points links to the other pages at their .html files', () => {
    expect(withAppLinks('<a href="/about">About</a> · <a href="/privacy">Privacy</a>')).toBe(
      '<a href="/about.html">About</a> · <a href="/privacy.html">Privacy</a>',
    );
  });

  it('leaves the game, files and other sites alone', () => {
    const html =
      '<a href="/">Play</a><link href="/fonts/a.woff2" /><a href="https://x.org/about">x</a>';
    expect(withAppLinks(html)).toBe(html);
  });

  it('leaves no link without a file name in any page', () => {
    for (const file of ['index.html', ...PAGES.map((page) => `${page}.html`)]) {
      const built = withAppLinks(readFileSync(file, 'utf8'));
      // In the app, any such path would open the game instead.
      expect(built, file).not.toMatch(/href="\/[^"./]+"/);
    }
  });
});

describe('appSiteUrl', () => {
  it('needs SITE_URL', () => {
    expect(() => appSiteUrl(undefined)).toThrow('The app build needs SITE_URL');
    expect(() => appSiteUrl('')).toThrow('The app build needs SITE_URL');
  });

  it('takes the same addresses as the web build', () => {
    expect(appSiteUrl('https://example.org/')).toBe('https://example.org');
    expect(() => appSiteUrl('http://example.org')).toThrow('SITE_URL must be an https address');
  });
});

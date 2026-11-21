// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { el } from './dom.ts';

describe('el', () => {
  it('creates an element with attributes and children', () => {
    const link = el('a', { href: './', class: 'x' }, 'Play ', el('code', {}, 'needle'));
    expect(link.outerHTML).toBe('<a href="./" class="x">Play <code>needle</code></a>');
  });

  it('creates an empty element without attributes', () => {
    expect(el('p').outerHTML).toBe('<p></p>');
  });

  it('adds strings as text, never as markup', () => {
    const p = el('p', {}, '<img src=x onerror=alert(1)>');
    expect(p.children).toHaveLength(0);
    expect(p.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

/**
 * The app's only DOM helper. Strings become text nodes, never HTML, so level
 * text cannot inject markup.
 */
export type Child = Node | string;

/** A `tag` element with these attributes and children. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
  ...children: readonly Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

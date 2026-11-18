/** Placeholder content until the app shell lands. */
export function renderPlaceholder(root: HTMLElement): void {
  const heading = document.createElement('h1');
  heading.textContent = 'Beat the Optimizer';
  const text = document.createElement('p');
  text.textContent = 'A daily join-order puzzle. Coming soon.';
  root.replaceChildren(heading, text);
}

import { renderPlaceholder } from './ui/placeholder.ts';

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  renderPlaceholder(root);
}

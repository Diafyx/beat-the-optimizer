import './style.css';
import { start } from './ui/app.ts';

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  void start(root, window.location.search);
}

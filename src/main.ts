import './style.css';
import { start } from './ui/app.ts';
import { appShareTarget } from './ui/native-share.ts';

/** True in the Android app's build (vite.config.ts). */
declare const __APP__: boolean;

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  // In the app, Share opens Android's share sheet; on the web, navigator's.
  const options = __APP__ ? { shareTarget: await appShareTarget() } : {};
  void start(root, window.location.search, options);
}

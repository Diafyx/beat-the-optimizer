// The Google Play app (docs/android-app.md): Capacitor packages the app build
// of the site (npm run build-app, scripts/lib/app-build.ts) into android/.
import type { CapacitorConfig } from '@capacitor/cli';
import { APP_OUT_DIR } from './scripts/lib/app-build.ts';

const config: CapacitorConfig = {
  // The package name on Google Play. It can never change.
  appId: 'org.diafyx.beattheoptimizer',
  appName: 'Beat the Optimizer',
  webDir: APP_OUT_DIR,
  // The game's dark page colour, behind the page while it loads.
  backgroundColor: '#0e1012',
  plugins: {
    SystemBars: {
      // Light status bar icons on the dark game, whatever the phone's theme.
      style: 'DARK',
    },
  },
};

export default config;

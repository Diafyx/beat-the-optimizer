import { defineConfig } from 'vitest/config';
import { analyticsConfig, headersFile } from './scripts/lib/analytics-config.ts';
import { APP_MODE, APP_OUT_DIR, appSiteUrl, withAppLinks } from './scripts/lib/app-build.ts';
import { siteUrl, withSiteUrl } from './scripts/lib/site-url.ts';

const full = { lines: 100, branches: 100, functions: 100, statements: 100 };
const analytics = analyticsConfig(process.env);

export default defineConfig(({ mode }) => {
  // The Android app's copy of the site (npm run build-app); see scripts/lib/app-build.ts.
  const app = mode === APP_MODE;
  return {
    plugins: [
      {
        // Absolute URLs for link previews; see scripts/lib/site-url.ts.
        name: 'site-url',
        transformIndexHtml: {
          order: 'pre',
          handler: (html: string) => withSiteUrl(html, siteUrl(process.env['SITE_URL'])),
        },
      },
      {
        // In the app, links to the other pages need their .html names.
        name: 'app-links',
        apply: () => app,
        transformIndexHtml: { order: 'pre', handler: withAppLinks },
      },
      {
        // The Content-Security-Policy, allowing only the analytics hosts in use;
        // see scripts/lib/analytics-config.ts. The app has no web server to read it.
        name: 'headers',
        apply: (_config, { command }) => command === 'build' && !app,
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(analytics) });
        },
      },
    ],
    define: {
      __ANALYTICS__: JSON.stringify(analytics),
      // The share card's link in the app; on the web, '' (the page's own address).
      __APP_SITE_URL__: JSON.stringify(app ? appSiteUrl(process.env['SITE_URL']) : ''),
    },
    build: {
      outDir: app ? APP_OUT_DIR : 'dist',
      sourcemap: true,
      rolldownOptions: { input: ['index.html', 'about.html', 'privacy.html'] },
    },
    test: {
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'authoring/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['tests/setup/fail-on-console.ts'],
      sequence: { shuffle: true },
      // On GitHub Actions, the github-actions reporter adds failure annotations
      // and the job summary. Setting `reporters` replaces Vitest's defaults, so
      // it has to be listed here.
      reporters: [
        'default',
        'junit',
        ...(process.env['GITHUB_ACTIONS'] === 'true' ? ['github-actions'] : []),
      ],
      outputFile: { junit: 'reports/junit.xml' },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts', 'scripts/lib/**/*.ts', 'authoring/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'authoring/**/*.test.ts'],
        reporter: ['text', 'lcov', 'json-summary'],
        reportsDirectory: 'coverage',
        thresholds: {
          lines: 95,
          branches: 95,
          functions: 95,
          statements: 95,
          'src/engine/**': full,
          'authoring/**': full,
        },
      },
    },
  };
});

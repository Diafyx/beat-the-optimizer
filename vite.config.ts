import { defineConfig } from 'vitest/config';

const full = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
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
});

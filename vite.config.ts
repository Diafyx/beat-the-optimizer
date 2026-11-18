import { defineConfig } from 'vitest/config';

const full = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup/fail-on-console.ts'],
    sequence: { shuffle: true },
    reporters: ['default', 'junit'],
    outputFile: { junit: 'reports/junit.xml' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'scripts/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 95,
        branches: 95,
        functions: 95,
        statements: 95,
        'src/engine/**': full,
      },
    },
  },
});

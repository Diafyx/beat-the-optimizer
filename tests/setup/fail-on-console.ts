// Warnings are errors (A13): any console.warn or console.error during a test
// fails that test. A test that expects a warning spies on the console itself,
// for example vi.spyOn(console, 'warn').mockImplementation(() => {}).
import { afterEach, beforeEach, vi } from 'vitest';

const unexpected: string[] = [];

beforeEach(() => {
  for (const method of ['warn', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      unexpected.push(`console.${method}: ${args.map(String).join(' ')}`);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if (unexpected.length > 0) {
    const messages = unexpected.splice(0).join('\n');
    throw new Error(`Unexpected console output during the test:\n${messages}`);
  }
});

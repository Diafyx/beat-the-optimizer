import { describe, expect, it } from 'vitest';
import { SCRIPT_BUDGET_BYTES, bundleReport } from '../../scripts/lib/bundle-size.ts';

describe('bundleReport', () => {
  it('passes a build within the 60 kB budget, listing files largest first', () => {
    const report = bundleReport([
      { file: 'assets/a.js', gzipBytes: 1_000 },
      { file: 'assets/index.js', gzipBytes: 20_500 },
      { file: 'assets/b.js', gzipBytes: 1_000 },
    ]);
    expect(SCRIPT_BUDGET_BYTES).toBe(60_000);
    expect(report.total).toBe(22_500);
    expect(report.problems).toEqual([]);
    expect(report.markdown).toBe(
      [
        '### Bundle size',
        '',
        '| File | Gzipped |',
        '|---|---:|',
        '| assets/index.js | 20.50 kB |',
        '| assets/a.js | 1.00 kB |',
        '| assets/b.js | 1.00 kB |',
        '| **Total** (budget 60.00 kB) | **22.50 kB** |',
        '',
      ].join('\n'),
    );
  });

  it('passes exactly at the budget and fails one byte over it', () => {
    expect(bundleReport([{ file: 'a.js', gzipBytes: 60_000 }]).problems).toEqual([]);
    expect(bundleReport([{ file: 'a.js', gzipBytes: 60_001 }]).problems).toEqual([
      'The JavaScript is 60.00 kB gzipped, over the 60.00 kB budget by 0.00 kB.',
    ]);
  });

  it('takes a custom budget', () => {
    expect(bundleReport([{ file: 'a.js', gzipBytes: 1_500 }], 1_000).problems).toEqual([
      'The JavaScript is 1.50 kB gzipped, over the 1.00 kB budget by 0.50 kB.',
    ]);
  });

  it('fails when the build has no JavaScript', () => {
    expect(bundleReport([]).problems).toEqual([
      'No JavaScript found in dist/. Run `vite build` first.',
    ]);
  });
});

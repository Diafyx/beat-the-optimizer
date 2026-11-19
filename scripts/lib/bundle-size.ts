// The bundle-size gate: the JavaScript in the production build, gzipped,
// must stay within the budget. See "What CI checks" in CONTRIBUTING.md.

/** 60 kB of gzipped JavaScript for the whole site. */
export const SCRIPT_BUDGET_BYTES = 60_000;

export interface Asset {
  file: string;
  gzipBytes: number;
}

export interface BundleReport {
  total: number;
  budget: number;
  /** Empty when the build is within budget. */
  problems: string[];
  /** A Markdown table for the job summary. */
  markdown: string;
}

const kB = (bytes: number): string => `${(bytes / 1000).toFixed(2)} kB`;

export function bundleReport(
  assets: readonly Asset[],
  budget: number = SCRIPT_BUDGET_BYTES,
): BundleReport {
  const sorted = [...assets].sort(
    (a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file),
  );
  const total = sorted.reduce((sum, asset) => sum + asset.gzipBytes, 0);
  const problems: string[] = [];
  if (sorted.length === 0) {
    problems.push('No JavaScript found in dist/. Run `vite build` first.');
  } else if (total > budget) {
    problems.push(
      `The JavaScript is ${kB(total)} gzipped, over the ${kB(budget)} budget by ${kB(total - budget)}.`,
    );
  }
  const markdown = [
    '### Bundle size',
    '',
    '| File | Gzipped |',
    '|---|---:|',
    ...sorted.map((asset) => `| ${asset.file} | ${kB(asset.gzipBytes)} |`),
    `| **Total** (budget ${kB(budget)}) | **${kB(total)}** |`,
    '',
  ].join('\n');
  return { total, budget, problems, markdown };
}

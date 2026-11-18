// Pull request size: lines added plus lines deleted, without the files marked
// linguist-generated in .gitattributes. See "Size" in CONTRIBUTING.md.
import { section } from './markdown.ts';

export interface FileChange {
  path: string;
  lines: number;
}

/**
 * Parses `git diff --numstat -z`. A rename is "added\tdeleted\t" followed by
 * the old and the new path; a binary file has "-" counts and counts as 0.
 */
export function parseNumstat(output: string): FileChange[] {
  const tokens = output.split('\0').values();
  const changes: FileChange[] = [];
  for (const token of tokens) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(token);
    if (!match) continue;
    // Every group takes part in a match, so all three are strings.
    const [added, deleted, inline] = match.slice(1) as [string, string, string];
    let path = inline;
    if (inline === '') {
      tokens.next(); // the old path of a rename
      const renamed = tokens.next();
      if (renamed.done) break; // truncated output
      path = renamed.value;
    }
    const lines = (added === '-' ? 0 : Number(added)) + (deleted === '-' ? 0 : Number(deleted));
    changes.push({ path, lines });
  }
  return changes;
}

/**
 * Paths that `git check-attr -z linguist-generated` reports as generated
 * ("path\0attribute\0value\0" triples; the value is "set" or "true").
 */
export function generatedPaths(output: string): Set<string> {
  const tokens = output.split('\0');
  const generated = new Set<string>();
  for (let i = 0; i + 2 < tokens.length; i += 3) {
    const [path, , value] = tokens.slice(i, i + 3) as [string, string, string];
    if (value === 'set' || value === 'true') generated.add(path);
  }
  return generated;
}

export function countLines(changes: readonly FileChange[], generated: ReadonlySet<string>): number {
  return changes
    .filter((change) => !generated.has(change.path))
    .reduce((sum, change) => sum + change.lines, 0);
}

const LIMITS: readonly [number, string][] = [
  [100, 'size/S'],
  [300, 'size/M'],
  [700, 'size/L'],
  [1500, 'size/XL'],
];

export function sizeLabel(lines: number): string {
  return LIMITS.find(([limit]) => lines <= limit)?.[1] ?? 'size/XXL';
}

/** The label edits that leave exactly one size/* label, `target`. */
export function sizeLabelChanges(
  current: readonly string[],
  target: string,
): { add: string[]; remove: string[] } {
  return {
    add: current.includes(target) ? [] : [target],
    remove: current.filter((label) => label.startsWith('size/') && label !== target),
  };
}

export const LARGE_HEADING = '### Why is this PR large?';

/** True if "Why is this PR large?" has an answer other than "N/A" or "No". */
export function explainsLargeSize(body: string): boolean {
  const answer = section(body, LARGE_HEADING);
  return answer !== null && answer !== '' && !/^(?:n\/?a|no|none)\.?$/i.test(answer);
}

/** Fails a size/XXL pull request that does not say why it is large. */
export function checkSize(label: string, body: string): string[] {
  if (label !== 'size/XXL' || explainsLargeSize(body)) return [];
  return [
    `This pull request is size/XXL (more than 1500 changed lines). Split it, or explain under "${LARGE_HEADING}" why it cannot be split.`,
  ];
}

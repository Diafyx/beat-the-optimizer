import picomatch from 'picomatch';
import { parse } from 'yaml';

/** Filter groups from .github/filters.yml: group name to glob patterns. */
export type FilterGroups = Readonly<Record<string, readonly string[]>>;

// dorny/paths-filter matches with picomatch and { dot: true }; match it exactly.
const MATCH_OPTIONS = { dot: true } as const;

/**
 * Parses filters.yml. Only plain string patterns are supported (nested lists,
 * as produced by YAML anchors, are flattened). Anything else is rejected, so
 * the guard never silently ignores a rule that paths-filter would apply.
 */
export function parseFilters(text: string): FilterGroups {
  const data: unknown = parse(text);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('filters.yml must be a mapping of group names to pattern lists');
  }
  const groups: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(data)) {
    if (!Array.isArray(value)) {
      throw new Error(`filters.yml: group "${name}" must be a list of patterns`);
    }
    const patterns = value.flat(Infinity) as unknown[];
    if (patterns.length === 0 || !patterns.every((p) => typeof p === 'string')) {
      throw new Error(`filters.yml: group "${name}" must contain only string patterns`);
    }
    groups[name] = patterns;
  }
  return groups;
}

/** Files that match no pattern of any group, in input order. */
export function unmatchedFiles(files: readonly string[], groups: FilterGroups): string[] {
  const patterns = Object.values(groups).flat();
  const isMatch = picomatch(patterns, MATCH_OPTIONS);
  return files.filter((file) => !isMatch(file));
}

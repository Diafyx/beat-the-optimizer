/** The only registry package-lock.json may download from (see .npmrc). */
export const REGISTRY = 'https://registry.npmjs.org/';

/**
 * Entries of a package-lock.json (lockfile version 2 or 3) whose `resolved` URL
 * is not on the public npm registry, as "<path>: <url>". Entries without a
 * `resolved` URL (the root package and workspace links) are skipped.
 */
export function foreignResolved(lockText: string): string[] {
  const lock: unknown = JSON.parse(lockText);
  const packages =
    lock !== null && typeof lock === 'object' && 'packages' in lock ? lock.packages : undefined;
  if (packages === null || typeof packages !== 'object') {
    throw new Error('package-lock.json has no "packages" map (lockfile version 2 or 3 expected)');
  }
  const foreign: string[] = [];
  for (const [path, entry] of Object.entries(packages as Record<string, unknown>)) {
    const resolved: unknown =
      entry !== null && typeof entry === 'object' && 'resolved' in entry
        ? entry.resolved
        : undefined;
    if (typeof resolved === 'string') {
      if (!resolved.startsWith(REGISTRY)) foreign.push(`${path}: ${resolved}`);
    } else if (resolved !== undefined) {
      foreign.push(`${path}: ${JSON.stringify(resolved)}`);
    }
  }
  return foreign;
}

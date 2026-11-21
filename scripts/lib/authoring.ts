import { basename } from 'node:path';

/** One spec and the level file that authoring writes from it. */
export interface Target {
  readonly spec: string;
  readonly level: string;
}

/**
 * The example spec is authored too, so a change to the pipeline runs it
 * against PostgreSQL even before there are levels.
 */
export const EXAMPLE: Target = {
  spec: 'authoring/fixtures/example-spec.yaml',
  level: 'authoring/fixtures/example-level.json',
};

/**
 * What `npm run author-level` writes: the example, then `levels/<name>.json`
 * for each `levels/specs/<name>.yaml`. Throws if it was given arguments, or
 * if a level file in `levels/` has no spec, since the drift check could not
 * regenerate it.
 */
export function authoringTargets(
  args: readonly string[],
  specs: readonly string[],
  levels: readonly string[],
): Target[] {
  if (args.length > 0) throw new Error('Usage: npm run author-level (it takes no arguments)');
  const targets = [...specs]
    .sort()
    .map((spec) => ({ spec, level: `levels/${basename(spec, '.yaml')}.json` }));
  const written = new Set(targets.map(({ level }) => level));
  const orphans = levels.filter((level) => !written.has(level));
  if (orphans.length > 0) {
    throw new Error(`These level files have no spec in levels/specs/: ${orphans.join(', ')}`);
  }
  return [EXAMPLE, ...targets];
}

/** `attempt()`, retried after `wait()` until it returns or has thrown `times` times. */
export function retry<T>(attempt: () => T, wait: () => void, times: number): T {
  for (let tries = 1; ; tries += 1) {
    try {
      return attempt();
    } catch (error) {
      if (tries >= times) throw error;
      wait();
    }
  }
}

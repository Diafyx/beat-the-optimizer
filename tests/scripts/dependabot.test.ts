import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { checkLabels, checkTitle, parseTitle } from '../../scripts/lib/pr-rules.ts';

interface Update {
  'package-ecosystem': string;
  'commit-message': { prefix: string };
  labels: string[];
  ignore?: { 'dependency-name': string; 'update-types': string[] }[];
  groups: Record<string, { 'update-types': string[] }>;
}

const config = parse(readFileSync('.github/dependabot.yml', 'utf8')) as { updates: Update[] };
const labelNames = new Set(
  (parse(readFileSync('.github/labels.yml', 'utf8')) as { name: string }[]).map((l) => l.name),
);

describe('.github/dependabot.yml', () => {
  it('covers npm and GitHub Actions', () => {
    expect(config.updates.map((update) => update['package-ecosystem'])).toEqual([
      'npm',
      'github-actions',
    ]);
  });

  it('ignores the npm majors that must not or cannot land', () => {
    const npm = config.updates.find((update) => update['package-ecosystem'] === 'npm');
    expect(npm?.ignore).toEqual([
      { 'dependency-name': '@types/node', 'update-types': ['version-update:semver-major'] },
      { 'dependency-name': 'typescript', 'update-types': ['version-update:semver-major'] },
    ]);
  });

  it('keeps @types/node on the oldest supported Node major', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      engines: { node: string };
      devDependencies: Record<string, string>;
    };
    const oldest = /\d+/.exec(pkg.engines.node)?.[0];
    expect(pkg.devDependencies['@types/node']).toMatch(new RegExp(`^\\^${String(oldest)}\\.`));
  });

  describe.each(config.updates)('$package-ecosystem', (update) => {
    // The titles Dependabot builds from the prefix, for one update and a group.
    const [group] = Object.keys(update.groups);
    const titles = [
      `${update['commit-message'].prefix}: bump some-package from 1.2.3 to 1.3.0`,
      `${update['commit-message'].prefix}: bump the ${String(group)} group with 3 updates`,
    ];

    it.each(titles)('produces a title and labels that pass pr-hygiene: %s', (title) => {
      expect(checkTitle(title)).toEqual([]);
      expect(checkLabels(update.labels, parseTitle(title))).toEqual([]);
    });

    it('uses only labels from .github/labels.yml', () => {
      for (const label of update.labels) expect(labelNames).toContain(label);
      expect(update.labels).toContain('dependencies');
    });

    it('groups minor and patch updates and leaves majors separate', () => {
      expect(Object.values(update.groups)).toEqual([{ 'update-types': ['minor', 'patch'] }]);
    });
  });
});

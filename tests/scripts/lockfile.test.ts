import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { foreignResolved } from '../../scripts/lib/lockfile.ts';

const lock = (packages: unknown): string => JSON.stringify({ lockfileVersion: 3, packages });

describe('foreignResolved', () => {
  it('accepts entries resolved from registry.npmjs.org and entries without a URL', () => {
    expect(
      foreignResolved(
        lock({
          '': { name: 'root' },
          'node_modules/yaml': {
            resolved: 'https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz',
          },
          'node_modules/@types/node': {
            resolved: 'https://registry.npmjs.org/@types/node/-/node-22.20.5.tgz',
          },
        }),
      ),
    ).toEqual([]);
  });

  it('lists entries from a mirror, another host, or with a non-string URL', () => {
    expect(
      foreignResolved(
        lock({
          'node_modules/a': { resolved: 'https://registry.npmmirror.com/a/-/a-1.0.0.tgz' },
          'node_modules/b': { resolved: 'https://registry.npmjs.org.evil.example/b.tgz' },
          'node_modules/c': { resolved: 'git+https://github.com/x/c.git' },
          'node_modules/d': { resolved: 42 },
          'node_modules/e': null,
        }),
      ),
    ).toEqual([
      'node_modules/a: https://registry.npmmirror.com/a/-/a-1.0.0.tgz',
      'node_modules/b: https://registry.npmjs.org.evil.example/b.tgz',
      'node_modules/c: git+https://github.com/x/c.git',
      'node_modules/d: 42',
    ]);
  });

  it('rejects a lockfile without a packages map', () => {
    expect(() => foreignResolved('{"lockfileVersion": 1, "dependencies": {}}')).toThrow(
      /no "packages" map/,
    );
    expect(() => foreignResolved('null')).toThrow(/no "packages" map/);
  });

  it('passes on the repository lockfile', () => {
    expect(foreignResolved(readFileSync('package-lock.json', 'utf8'))).toEqual([]);
  });
});

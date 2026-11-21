import { describe, expect, it } from 'vitest';
import { applySettingsSql, checkSettings, SETTINGS, showSettingsSql } from './settings.ts';

describe('applySettingsSql', () => {
  it('sets each setting with ALTER SYSTEM, then reloads the configuration', () => {
    const lines = applySettingsSql().split('\n');
    expect(lines.slice(0, 2)).toEqual([
      "ALTER SYSTEM SET autovacuum = 'off';",
      "ALTER SYSTEM SET cpu_index_tuple_cost = '0.005';",
    ]);
    expect(lines.slice(-2)).toEqual(['SELECT pg_reload_conf();', '']);
    expect(lines).toHaveLength(Object.keys(SETTINGS).length + 2);
    // Sorted, so levels record them in a stable order.
    expect(Object.keys(SETTINGS)).toEqual([...Object.keys(SETTINGS)].sort());
  });
});

describe('showSettingsSql', () => {
  it('reads every setting as SHOW prints it', () => {
    const sql = showSettingsSql();
    expect(sql).toMatch(
      /^SELECT json_build_object\('autovacuum', current_setting\('autovacuum'\), 'cpu_index_tuple_cost', /,
    );
    expect(sql.match(/current_setting/g)).toHaveLength(Object.keys(SETTINGS).length);
  });
});

describe('checkSettings', () => {
  it('returns the settings when PostgreSQL has them', () => {
    expect(checkSettings({ ...SETTINGS, server_version: '18.1' })).toEqual(SETTINGS);
  });

  it('names every setting that differs or is missing', () => {
    const shown = Object.fromEntries(
      Object.entries({ ...SETTINGS, jit: 'on' }).filter(([name]) => name !== 'work_mem'),
    );
    expect(() => checkSettings(shown)).toThrow(
      'PostgreSQL does not have the authoring settings: jit is "on", not off; work_mem is missing, not 4MB',
    );
  });

  it('rejects output that is not an object', () => {
    expect(() => checkSettings([SETTINGS])).toThrow('autovacuum is missing, not off');
  });
});

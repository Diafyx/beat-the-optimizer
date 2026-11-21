import { describe, expect, it } from 'vitest';
import { formatCorrelation, formatCount, formatShare, formatValue } from './format.ts';

describe('format', () => {
  it('writes row counts with thousands separators', () => {
    expect(formatCount(100_000)).toBe('100,000');
    expect(formatCount(1)).toBe('1');
  });

  it('writes shares as percentages to three significant digits', () => {
    expect(formatShare(0.7)).toBe('70%');
    expect(formatShare(0.005)).toBe('0.5%');
    expect(formatShare(0.295)).toBe('29.5%');
    expect(formatShare(0)).toBe('0%');
  });

  it('writes correlations to two decimals', () => {
    expect(formatCorrelation(0.4571524)).toBe('0.46');
    expect(formatCorrelation(1)).toBe('1.00');
    expect(formatCorrelation(-0.05)).toBe('-0.05');
  });

  it('writes values as SQL does', () => {
    expect(formatValue('IS')).toBe("'IS'");
    expect(formatValue("night's")).toBe("'night''s'");
    expect(formatValue(42)).toBe('42');
    expect(formatValue(true)).toBe('true');
  });
});

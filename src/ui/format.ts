/** How the app writes numbers and values. */
import type { Scalar } from '../engine/index.ts';

const counts = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const shares = new Intl.NumberFormat('en-US', { style: 'percent', maximumSignificantDigits: 3 });
const ratios = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const correlations = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** A row count, such as `100,000`. */
export const formatCount = (rows: number): string => counts.format(rows);

/** A fraction as a percentage, such as `0.5%` or `70%`. */
export const formatShare = (fraction: number): string => shares.format(fraction);

/** A ratio, to two decimals at most, such as `37×` or `2.41×`. */
export const formatRatio = (ratio: number): string => `${ratios.format(ratio)}×`;

/** A correlation, to two decimals. */
export const formatCorrelation = (value: number): string => correlations.format(value);

/** A value as SQL writes it: strings quoted, numbers and booleans as they are. */
export const formatValue = (value: Scalar): string =>
  typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : String(value);

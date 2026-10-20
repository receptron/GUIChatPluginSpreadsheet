/**
 * Time-series rules over plain numbers, as statsmodels and pandas compute them: the autocorrelation
 * at one lag (statsmodels `acf`), the exponential moving average (pandas `ewm(alpha, adjust=False)`),
 * and the classical decomposition into trend, seasonal and residual (statsmodels `seasonal_decompose`).
 */

import { DIV_ZERO_ERROR, NA_ERROR, NUM_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellValue } from "../types";

const MIN_PERIOD = 2;

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

/** The autocorrelation at `lag`: Σ(xₜ − x̄)(xₜ₊ₖ − x̄) over Σ(xₜ − x̄)². A lag that is not a whole
 *  number from 0 up to the number of values is #NUM!; values that never vary have none (#DIV/0!). */
export function autocorrelation(values: readonly number[], lag: number): number | SpreadsheetError {
  if (!Number.isInteger(lag) || lag < 0 || lag >= values.length) return NUM_ERROR;
  const center = mean(values);
  const deviations = values.map((value) => value - center);
  const spread = deviations.reduce((sum, deviation) => sum + deviation * deviation, 0);
  if (spread === 0) return DIV_ZERO_ERROR;
  const together = deviations.slice(0, deviations.length - lag).reduce((sum, deviation, index) => sum + deviation * (deviations[index + lag] ?? 0), 0);
  return together / spread;
}

/** The exponential moving average: the first value, then α·xₜ + (1 − α)·sₜ₋₁. α must be in (0, 1]. */
export function exponentialAverage(values: readonly number[], alpha: number): number[] | SpreadsheetError {
  if (!(alpha > 0 && alpha <= 1)) return NUM_ERROR;
  return values.reduce<number[]>(
    (averages, value, index) => [...averages, index === 0 ? value : alpha * value + (1 - alpha) * (averages[index - 1] ?? value)],
    [],
  );
}

/** The centred moving average over one period, null where its window does not fit: a period's values
 *  equally weighted for an odd period; for an even one, period + 1 values with half weight at each end. */
function centredAverage(values: readonly number[], period: number): (number | null)[] {
  const weights =
    period % 2 === 1
      ? Array.from({ length: period }, () => 1 / period)
      : Array.from({ length: period + 1 }, (_, index) => (index === 0 || index === period ? 0.5 : 1) / period);
  const half = (weights.length - 1) / 2;
  return values.map((_, index) => {
    const start = index - half;
    if (start < 0 || start + weights.length > values.length) return null;
    return weights.reduce((sum, weight, offset) => sum + weight * (values[start + offset] ?? 0), 0);
  });
}

export type DecompositionModel = "additive" | "multiplicative";

/** The classical decomposition: for each value, its trend, seasonal and residual parts (#N/A where the
 *  trend's window does not fit). The period must be a whole number of at least 2 with two full periods
 *  of values, and a multiplicative model needs every value above 0; #NUM! otherwise. */
export function decomposition(values: readonly number[], period: number, model: DecompositionModel): CellValue[][] | SpreadsheetError {
  const cycle = period;
  if (!Number.isInteger(cycle) || cycle < MIN_PERIOD || values.length < 2 * cycle || (model === "multiplicative" && !values.every((value) => value > 0)))
    return NUM_ERROR;
  const additive = model === "additive";
  const trend = centredAverage(values, cycle);
  const detrended = values.map((value, index) => {
    const level = trend[index];
    if (level === null || level === undefined) return null;
    return additive ? value - level : value / level;
  });
  const averages = Array.from({ length: cycle }, (_, phase) =>
    mean(detrended.filter((value, index): value is number => value !== null && index % cycle === phase)),
  );
  const overall = mean(averages);
  const seasonal = averages.map((average) => (additive ? average - overall : average / overall));
  return values.map((value, index) => {
    const level = trend[index];
    const season = seasonal[index % cycle] ?? 0;
    if (level === null || level === undefined) return [NA_ERROR, season, NA_ERROR];
    return [level, season, additive ? value - level - season : value / (level * season)];
  });
}

/**
 * FORECAST.ETS's model: additive Holt-Winters (a level, a trend and an additive season) in
 * statsmodels' form, its smoothing parameters chosen to minimise the squared one-step errors. Excel
 * does not publish how it fits its model, so values can differ from Excel's.
 */

import { NUM_ERROR, isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";
import { autocorrelation } from "./time-series-math";

export const MAX_SEASONALITY = 8760;
const MAX_MISSING_SHARE = 0.3;
const STEP_TOLERANCE = 1e-9;
const SIGNIFICANT_CORRELATION_Z = 1.96;
const MIN_SEASON = 2;
const MIN_POINTS_WITHOUT_SEASON = 3;
const COARSE_STEP = 0.05;
const FINE_STEP = 0.005;

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const mean = (values: readonly number[]): number => sum(values) / values.length;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** How values at one time are combined, by the aggregation argument: 0 and 1 AVERAGE, then COUNT,
 *  COUNTA, MAX, MEDIAN, MIN and SUM. */
const AGGREGATIONS: readonly ((values: readonly number[]) => number)[] = [
  mean,
  mean,
  (values) => values.length,
  (values) => values.length,
  (values) => Math.max(...values),
  median,
  (values) => Math.min(...values),
  sum,
];

export const LAST_AGGREGATION = AGGREGATIONS.length - 1;

export const aggregationOf = (code: number): ((values: readonly number[]) => number) => AGGREGATIONS[code] ?? mean;

export interface TimedValue {
  time: number;
  value: number;
}

/** Values one step apart, ending at `lastTime`. */
export interface RegularSeries {
  values: number[];
  lastTime: number;
  step: number;
}

/** Each distinct time with the values at it, in time order. */
function groupedByTime(points: readonly TimedValue[]): { time: number; values: number[] }[] {
  const sorted = [...points].sort((left, right) => left.time - right.time);
  return sorted.reduce<{ time: number; values: number[] }[]>((groups, point) => {
    const last = groups.at(-1);
    if (last && last.time === point.time) last.values.push(point.value);
    else groups.push({ time: point.time, values: [point.value] });
    return groups;
  }, []);
}

/** Each time's position in steps from the first, or null when a gap is not a whole number of steps. */
function stepOffsets(times: readonly number[], step: number): number[] | null {
  const first = times[0] ?? 0;
  const offsets = times.map((time) => (time - first) / step);
  const whole = offsets.every((offset) => Math.abs(offset - Math.round(offset)) <= STEP_TOLERANCE * Math.max(offset, 1));
  return whole ? offsets.map(Math.round) : null;
}

/** The values at `offsets` laid out one step apart, a missing point filled with zero or by a straight
 *  line between its neighbours. */
function filled(known: readonly number[], offsets: readonly number[], withZeros: boolean): number[] {
  const length = (offsets.at(-1) ?? 0) + 1;
  return Array.from({ length }, (_, position) => {
    const after = offsets.findIndex((offset) => offset >= position);
    if (offsets[after] === position) return known[after] ?? 0;
    if (withZeros) return 0;
    const [from, to] = [offsets[after - 1] ?? 0, offsets[after] ?? 0];
    const share = (position - from) / (to - from);
    return (known[after - 1] ?? 0) * (1 - share) + (known[after] ?? 0) * share;
  });
}

/** The points as a series one step apart: values at one time combined by `aggregate`, the step the
 *  smallest gap, and missing points filled. #NUM! when there are fewer than two times, a gap is not a
 *  whole number of steps, or more than 30% of the points are missing. */
export function regularSeries(
  points: readonly TimedValue[],
  aggregate: (values: readonly number[]) => number,
  withZeros: boolean,
): RegularSeries | SpreadsheetError {
  const groups = groupedByTime(points);
  const times = groups.map((group) => group.time);
  if (times.length < 2) return NUM_ERROR;
  const step = Math.min(...times.slice(1).map((time, index) => time - (times[index] ?? 0)));
  const offsets = stepOffsets(times, step);
  if (!offsets) return NUM_ERROR;
  const length = (offsets.at(-1) ?? 0) + 1;
  if (length - times.length > MAX_MISSING_SHARE * length) return NUM_ERROR;
  const values = filled(
    groups.map((group) => aggregate(group.values)),
    offsets,
    withZeros,
  );
  return { values, lastTime: times.at(-1) ?? 0, step };
}

/** The values less their least-squares line over 0, 1, 2, …. */
function detrended(values: readonly number[]): number[] {
  const indexMean = (values.length - 1) / 2;
  const valueMean = mean(values);
  const spread = sum(values.map((_, index) => (index - indexMean) ** 2));
  const slope = sum(values.map((value, index) => (index - indexMean) * (value - valueMean))) / spread;
  return values.map((value, index) => value - valueMean - slope * (index - indexMean));
}

/** The season's length: the lag from 2 to half the length (at most 8760) whose autocorrelation, with
 *  the trend line removed, is the highest local peak above 1.96/√n; 0 when there is none. */
export function detectedSeasonality(values: readonly number[]): number {
  const residuals = detrended(values);
  const longest = Math.min(Math.floor(values.length / 2), MAX_SEASONALITY);
  const correlations = Array.from({ length: longest + 2 }, (_, lag) => {
    const value = lag < values.length ? autocorrelation(residuals, lag) : 0;
    return isSpreadsheetErrorValue(value) ? 0 : value;
  });
  const correlation = (lag: number): number => correlations[lag] ?? 0;
  const threshold = SIGNIFICANT_CORRELATION_Z / Math.sqrt(values.length);
  const lags = Array.from({ length: Math.max(longest - 1, 0) }, (_, index) => index + MIN_SEASON);
  const peaks = lags.filter((lag) => correlation(lag) > threshold && correlation(lag) >= correlation(lag - 1) && correlation(lag) >= correlation(lag + 1));
  return peaks.reduce((best, lag) => (best === 0 || correlation(lag) > correlation(best) ? lag : best), 0);
}

/** Holt-Winters' smoothing parameters, in statsmodels' form. */
export interface Smoothing {
  alpha: number;
  beta: number;
  gamma: number;
}

/** The fitted model after the last value: its level, trend, and latest season for each phase. */
export interface EtsFit {
  smoothing: Smoothing;
  level: number;
  trend: number;
  season: number[];
  period: number;
  length: number;
  /** The mean squared one-step error. */
  variance: number;
}

interface Run {
  level: number;
  trend: number;
  season: number[];
  squaredErrors: number;
  count: number;
}

/** The state before the first value smoothed, and that value's index: with a season, the first
 *  season's mean, the change between the first two seasons' means, and the first season's deviations;
 *  without one, the second value and the first difference, smoothing from the third value. */
function initialRun(values: readonly number[], period: number): { run: Run; start: number } {
  if (period === 0) {
    const [first = 0, second = 0] = values;
    return { run: { level: second, trend: second - first, season: [], squaredErrors: 0, count: 0 }, start: 2 };
  }
  const firstMean = mean(values.slice(0, period));
  const secondMean = mean(values.slice(period, 2 * period));
  const season = values.slice(0, period).map((value) => value - firstMean);
  return { run: { level: firstMean, trend: (secondMean - firstMean) / period, season, squaredErrors: 0, count: 0 }, start: 0 };
}

/** The model after smoothing every value from the initial state. */
function smoothed(values: readonly number[], period: number, { alpha, beta, gamma }: Smoothing): Run {
  const { run, start } = initialRun(values, period);
  values.slice(start).forEach((value, offset) => {
    const phase = period === 0 ? 0 : (start + offset) % period;
    const seasonal = period === 0 ? 0 : (run.season[phase] ?? 0);
    const predicted = run.level + run.trend + seasonal;
    const level = alpha * (value - seasonal) + (1 - alpha) * (run.level + run.trend);
    if (period !== 0) run.season[phase] = gamma * (value - run.level - run.trend) + (1 - gamma) * seasonal;
    run.trend = beta * (level - run.level) + (1 - beta) * run.trend;
    run.level = level;
    run.squaredErrors += (value - predicted) ** 2;
    run.count += 1;
  });
  return run;
}

/** Points from `low` to `high` (clipped to 0…`limit`) `step` apart. */
function gridAround(low: number, high: number, step: number, limit: number): number[] {
  const [from, to] = [Math.max(low, 0), Math.min(high, limit)];
  const count = Math.floor((to - from) / step + STEP_TOLERANCE) + 1;
  return Array.from({ length: Math.max(count, 1) }, (_, index) => Math.min(from + index * step, to));
}

/** The smoothing with the least squared one-step error among α and β on the grids, and γ from 0 to
 *  1 − α (0 without a season); the first found wins a tie. */
function bestOnGrid(values: readonly number[], period: number, alphas: number[], betas: number[], gammaGrid: (alpha: number) => number[]): Smoothing {
  const candidates = alphas.flatMap((alpha) => betas.flatMap((beta) => (period === 0 ? [0] : gammaGrid(alpha)).map((gamma) => ({ alpha, beta, gamma }))));
  const scored = candidates.map((smoothing) => ({ smoothing, error: smoothed(values, period, smoothing).squaredErrors }));
  return scored.reduce((best, candidate) => (candidate.error < best.error ? candidate : best)).smoothing;
}

/** α, β and γ minimising the squared one-step errors: on a coarse grid, then a fine one around the best. */
function fittedSmoothing(values: readonly number[], period: number): Smoothing {
  const coarse = gridAround(0, 1, COARSE_STEP, 1);
  const rough = bestOnGrid(values, period, coarse, coarse, (alpha) => gridAround(0, 1 - alpha, COARSE_STEP, 1 - alpha));
  const near = (center: number, limit: number): number[] => gridAround(center - COARSE_STEP, center + COARSE_STEP, FINE_STEP, limit);
  return bestOnGrid(values, period, near(rough.alpha, 1), near(rough.beta, 1), (alpha) => near(rough.gamma, 1 - alpha));
}

/** The fitted model of a series one step apart, with a season of `period` points (0 for none).
 *  #NUM! with fewer than two full seasons of values, or fewer than three without a season. */
export function fitHoltWinters(values: readonly number[], period: number): EtsFit | SpreadsheetError {
  if (period === 0 ? values.length < MIN_POINTS_WITHOUT_SEASON : period < MIN_SEASON || values.length < 2 * period) return NUM_ERROR;
  return modelWith(values, period, fittedSmoothing(values, period));
}

/** The model after smoothing `values` with the given parameters (the series long enough for `period`). */
export function modelWith(values: readonly number[], period: number, smoothing: Smoothing): EtsFit {
  const run = smoothed(values, period, smoothing);
  return { smoothing, level: run.level, trend: run.trend, season: run.season, period, length: values.length, variance: run.squaredErrors / run.count };
}

/** The forecast `steps` whole steps past the last value (0 is the last value smoothed). */
function forecastAtStep(fit: EtsFit, steps: number): number {
  const seasonal = fit.period === 0 ? 0 : (fit.season[(fit.length - 1 + steps) % fit.period] ?? 0);
  return fit.level + steps * fit.trend + seasonal;
}

/** The forecast `steps` steps past the last value; between two whole steps, on the line joining them. */
export function forecastAt(fit: EtsFit, steps: number): number {
  const below = Math.floor(steps);
  const share = steps - below;
  return share === 0 ? forecastAtStep(fit, below) : forecastAtStep(fit, below) * (1 - share) + forecastAtStep(fit, below + 1) * share;
}

/** Σⱼ₌₁ᴷ cⱼ² for cⱼ = α + αβj + γ·[period divides j], in closed form. */
function errorWeightSum({ smoothing: { alpha, beta, gamma }, period }: EtsFit, last: number): number {
  const [base, slope] = [alpha, alpha * beta];
  const linear = last * base ** 2 + base * slope * last * (last + 1) + (slope ** 2 * last * (last + 1) * (2 * last + 1)) / 6;
  if (period === 0) return linear;
  const seasons = Math.floor(last / period);
  return linear + seasons * (2 * gamma * base + gamma ** 2) + gamma * slope * period * seasons * (seasons + 1);
}

/** The half-width of the interval around the forecast `steps` steps ahead holding `confidence` of
 *  future points: z·σ·√(1 + Σⱼ₌₁ᵏ⁻¹ cⱼ²), k = ⌈steps⌉ and at least 1 (ETS(A,A,A), Hyndman et al.). */
export function intervalAt(fit: EtsFit, steps: number, z: number): number {
  const ahead = Math.max(Math.ceil(steps), 1);
  return z * Math.sqrt(fit.variance * (1 + errorWeightSum(fit, ahead - 1)));
}

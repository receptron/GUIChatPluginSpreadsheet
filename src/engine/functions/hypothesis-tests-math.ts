/**
 * The p values of F.TEST, Z.TEST, CHISQ.TEST, and of the tests Excel does not have: one-way
 * analysis of variance, Mann-Whitney U, Wilcoxon signed-rank, two-sample Kolmogorov-Smirnov and
 * Shapiro-Wilk (Royston's AS R94). Every rank test is two-sided, and picks an exact null
 * distribution or the normal one as scipy.stats does by default (see each function).
 */

import { DIV_ZERO_ERROR, NA_ERROR, NUM_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import { chiSquareUpper, fCdf, fUpper } from "./distribution-families-math";
import { normalCdf, normalQuantile, summarize } from "./distribution-math";

type Result = number | SpreadsheetError;

const clampProbability = (p: number): number => Math.min(1, Math.max(0, p));
const twoSidedNormal = (z: number): number => clampProbability(2 * normalCdf(-Math.abs(z)));

// ---------------------------------------------------------------- F.TEST, Z.TEST

/** F.TEST: the two-tailed probability that the two variances do not differ. Fewer than two
 *  values in a sample, or a sample that never varies: #DIV/0!. */
export function fTest(first: number[], second: number[]): Result {
  if (first.length < 2 || second.length < 2) return DIV_ZERO_ERROR;
  const [a, b] = [summarize(first), summarize(second)];
  if (a.variance === 0 || b.variance === 0) return DIV_ZERO_ERROR;
  const ratio = a.variance / b.variance;
  const [d1, d2] = [a.count - 1, b.count - 1];
  return clampProbability(2 * Math.min(fCdf(ratio, d1, d2), fUpper(ratio, d1, d2)));
}

/** Z.TEST: the one-tailed probability of a mean at least this far above x, with the sample's own
 *  standard deviation unless sigma is given. No values: #N/A; sigma not positive: #NUM!. */
export function zTest(values: number[], x: number, sigma?: number): Result {
  if (values.length === 0) return NA_ERROR;
  if (sigma !== undefined && sigma <= 0) return NUM_ERROR;
  const { count, mean, variance } = summarize(values);
  const sd = sigma ?? Math.sqrt(variance);
  if (!(sd > 0)) return DIV_ZERO_ERROR;
  return normalCdf(-(mean - x) / (sd / Math.sqrt(count)));
}

// ---------------------------------------------------------------- CHISQ.TEST

/** The shape of CHISQ.TEST's tables, which sets its degrees of freedom. */
export interface TableShape {
  rows: number;
  columns: number;
}

/** CHISQ.TEST over the cells where both tables hold a number. An expected 0: #DIV/0!; no such
 *  cells: #DIV/0!; a single cell, which leaves no degrees of freedom: #N/A. */
export function chiSquareTest(observed: number[], expected: number[], { rows, columns }: TableShape): Result {
  const degrees = rows > 1 && columns > 1 ? (rows - 1) * (columns - 1) : rows * columns - 1;
  if (degrees === 0) return NA_ERROR;
  if (observed.length === 0 || expected.some((value) => value === 0)) return DIV_ZERO_ERROR;
  const statistic = observed.reduce((sum, value, index) => {
    const expectation = expected[index] ?? 0;
    return sum + (value - expectation) ** 2 / expectation;
  }, 0);
  return Number.isFinite(statistic) ? chiSquareUpper(statistic, degrees) : NUM_ERROR;
}

// ---------------------------------------------------------------- analysis of variance

/** ANOVA.TEST: the one-way analysis of variance's p value, F's right tail. Fewer than two groups,
 *  an empty group, or no spread within the groups (one value in each included): #DIV/0!. */
export function oneWayAnova(groups: number[][]): Result {
  if (groups.length < 2 || groups.some((group) => group.length === 0)) return DIV_ZERO_ERROR;
  const all = groups.flat();
  const grandMean = all.reduce((sum, value) => sum + value, 0) / all.length;
  const groupMeans = groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
  const between = groups.reduce((sum, group, index) => sum + group.length * ((groupMeans[index] ?? 0) - grandMean) ** 2, 0);
  const within = groups.reduce((sum, group, index) => sum + group.reduce((inner, value) => inner + (value - (groupMeans[index] ?? 0)) ** 2, 0), 0);
  const [betweenDegrees, withinDegrees] = [groups.length - 1, all.length - groups.length];
  if (within === 0) return DIV_ZERO_ERROR;
  return fUpper(between / betweenDegrees / (within / withinDegrees), betweenDegrees, withinDegrees);
}

// ---------------------------------------------------------------- ranks

interface Ranked {
  /** Each value's rank among all of them, ties sharing the mean of their ranks (1-based). */
  ranks: number[];
  /** The size of each group of equal values. */
  tieSizes: number[];
}

export function midRanks(values: readonly number[]): Ranked {
  const order = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const starts = order.flatMap((entry, position) => (position === 0 || entry.value !== order[position - 1]?.value ? [position] : []));
  const ranks = Array.from({ length: values.length }, () => 0);
  const tieSizes = starts.map((start, group) => {
    const stop = starts[group + 1] ?? order.length;
    order.slice(start, stop).forEach((entry) => (ranks[entry.index] = (start + 1 + stop) / 2));
    return stop - start;
  });
  return { ranks, tieSizes };
}

const tieTerm = (tieSizes: readonly number[]): number => tieSizes.reduce((sum, size) => sum + size ** 3 - size, 0);
const hasTies = (tieSizes: readonly number[]): boolean => tieSizes.some((size) => size > 1);

// ---------------------------------------------------------------- Mann-Whitney U

// scipy's default: the exact distribution when a sample has at most 8 values and nothing ties;
// past this many values of U the exact count is too slow and the normal one is used.
const MANN_WHITNEY_EXACT_MAX_SMALLER = 8;
const MANN_WHITNEY_EXACT_MAX_PRODUCT = 1_000_000;

/** The number of ways each U = 0..m·n can arise, m ≤ n: the coefficients of the Gaussian binomial
 *  [m + n choose m], built as ∏ (1 − q^(n+i)) / (1 − q^i) in exact integers. */
function mannWhitneyCounts(m: number, n: number): bigint[] {
  const counts = Array.from({ length: m * n + 1 }, () => 0n);
  counts[0] = 1n;
  Array.from({ length: m }, (_, offset) => offset + 1).forEach((i) => {
    for (let u = counts.length - 1; u >= n + i; u -= 1) counts[u] = (counts[u] ?? 0n) - (counts[u - n - i] ?? 0n);
    for (let u = i; u < counts.length; u += 1) counts[u] = (counts[u] ?? 0n) + (counts[u - i] ?? 0n);
  });
  return counts;
}

/** P(U ≥ u) under the null hypothesis, for samples of m and n values without ties. */
function mannWhitneyExactUpper(u: number, m: number, n: number): number {
  const counts = mannWhitneyCounts(Math.min(m, n), Math.max(m, n));
  const total = counts.reduce((sum, count) => sum + count, 0n);
  const tail = counts.slice(Math.ceil(u)).reduce((sum, count) => sum + count, 0n);
  return Number(tail) / Number(total);
}

/** MANNWHITNEY.TEST: the two-sided p value of the Mann-Whitney U test. Exact when a sample has at
 *  most 8 values, no values tie and m·n is at most 10^6; otherwise normal, with the tie and continuity corrections.
 *  An empty sample, or every value equal: #DIV/0!. */
export function mannWhitney(first: number[], second: number[]): Result {
  const [m, n] = [first.length, second.length];
  if (m === 0 || n === 0) return DIV_ZERO_ERROR;
  const { ranks, tieSizes } = midRanks([...first, ...second]);
  const firstRankSum = ranks.slice(0, m).reduce((sum, rank) => sum + rank, 0);
  const firstU = firstRankSum - (m * (m + 1)) / 2;
  const u = Math.max(firstU, m * n - firstU);
  const exact = Math.min(m, n) <= MANN_WHITNEY_EXACT_MAX_SMALLER && m * n <= MANN_WHITNEY_EXACT_MAX_PRODUCT && !hasTies(tieSizes);
  if (exact) return clampProbability(2 * mannWhitneyExactUpper(u, m, n));
  const total = m + n;
  const spread = Math.sqrt(((m * n) / 12) * (total + 1 - tieTerm(tieSizes) / (total * (total - 1))));
  if (!(spread > 0)) return DIV_ZERO_ERROR;
  return clampProbability(2 * normalCdf(-(u - (m * n) / 2 - 0.5) / spread));
}

// ---------------------------------------------------------------- Wilcoxon signed-rank

// scipy's default: the exact distribution for at most 50 differences, none of them zero.
const WILCOXON_EXACT_MAX = 50;

/** P(W ≤ t) for the signed-rank sum W of n differences without ties: the subsets of 1..n by sum,
 *  counted in doubles (at most 2^50, so exact). */
function wilcoxonExactLower(t: number, n: number): number {
  const maxSum = (n * (n + 1)) / 2;
  const counts = Array.from({ length: maxSum + 1 }, () => 0);
  counts[0] = 1;
  Array.from({ length: n }, (_, offset) => offset + 1).forEach((rank) => {
    for (let sum = maxSum; sum >= rank; sum -= 1) counts[sum] = (counts[sum] ?? 0) + (counts[sum - rank] ?? 0);
  });
  const below = counts.slice(0, Math.floor(t) + 1).reduce((sum, count) => sum + count, 0);
  return below / 2 ** n;
}

/** WILCOXON.TEST: the two-sided p value of the Wilcoxon signed-rank test of the differences
 *  against 0, zero differences dropped. Exact for at most 50 differences when none is zero and
 *  none ties; otherwise normal with the tie correction and no continuity correction. No nonzero
 *  difference, or no spread: #DIV/0!. */
export function wilcoxonSignedRank(differences: number[]): Result {
  const nonzero = differences.filter((difference) => difference !== 0);
  const n = nonzero.length;
  if (n === 0) return DIV_ZERO_ERROR;
  const { ranks, tieSizes } = midRanks(nonzero.map(Math.abs));
  const positiveSum = ranks.reduce((sum, rank, index) => ((nonzero[index] ?? 0) > 0 ? sum + rank : sum), 0);
  const smaller = Math.min(positiveSum, (n * (n + 1)) / 2 - positiveSum);
  const exact = n === differences.length && n <= WILCOXON_EXACT_MAX && !hasTies(tieSizes);
  if (exact) return clampProbability(2 * wilcoxonExactLower(smaller, n));
  const spread = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieTerm(tieSizes) / 48);
  if (!(spread > 0)) return DIV_ZERO_ERROR;
  return twoSidedNormal((positiveSum - (n * (n + 1)) / 4) / spread);
}

// ---------------------------------------------------------------- Kolmogorov-Smirnov

// Beyond this many lattice points the exact path count gives way to Kolmogorov's limit.
const KS_EXACT_MAX_PRODUCT = 10_000_000;
const KOLMOGOROV_TERMS = 100;
const KOLMOGOROV_SMALL_LAMBDA = 1;

/** The largest gap between the two empirical distribution functions, in units of 1 / (m·n) so
 *  that it is an integer: max |i·n − j·m| after each distinct value. */
function largestGap(first: number[], second: number[]): number {
  const [left, right] = [Float64Array.from(first).sort(), Float64Array.from(second).sort()];
  const pooled = Float64Array.from([...left, ...right]).sort();
  const counter = { i: 0, j: 0, gap: 0 };
  pooled.forEach((value, position) => {
    if (pooled[position + 1] === value) return;
    while (counter.i < left.length && (left[counter.i] ?? Infinity) <= value) counter.i += 1;
    while (counter.j < right.length && (right[counter.j] ?? Infinity) <= value) counter.j += 1;
    counter.gap = Math.max(counter.gap, Math.abs(counter.i * right.length - counter.j * left.length));
  });
  return counter.gap;
}

/** P(D ≥ gap) exactly: the share of monotone lattice paths from (0,0) to (m,n) that reach a point
 *  with |i·n − j·m| ≥ gap, summed as the probability of first reaching such a point, so a small p
 *  keeps its digits. A point counts only after `observed[i + j]` values, where D is observed: tied
 *  values are passed as one block, so a point inside a block is never seen. */
function ksExactOutside(m: number, n: number, gap: number, observed: readonly boolean[]): number {
  const reach = new Float64Array(n + 1);
  const outside = { mass: 0 };
  const isOutside = (i: number, j: number): boolean => observed[i + j] === true && Math.abs(i * n - j * m) >= gap;
  Array.from({ length: m + 1 }, (_, i) => i).forEach((i) => {
    Array.from({ length: n + 1 }, (_, j) => j).forEach((j) => {
      const fromLeft = i === 0 ? 0 : (reach[j] ?? 0) * ((m - i + 1) / (m - i + 1 + n - j));
      const fromBelow = j === 0 ? 0 : (reach[j - 1] ?? 0) * ((n - j + 1) / (m - i + n - j + 1));
      const arriving = i === 0 && j === 0 ? 1 : fromLeft + fromBelow;
      if (isOutside(i, j)) {
        outside.mass += arriving;
        reach[j] = 0;
      } else reach[j] = arriving;
    });
  });
  return outside.mass;
}

/** Kolmogorov's limiting P(K ≥ λ), from whichever of its two series converges at once. */
function kolmogorovUpper(lambda: number): number {
  const terms = Array.from({ length: KOLMOGOROV_TERMS }, (_, offset) => offset + 1);
  if (lambda < KOLMOGOROV_SMALL_LAMBDA) {
    const theta = (Math.PI * Math.PI) / (8 * lambda * lambda);
    const lower = (Math.sqrt(2 * Math.PI) / lambda) * terms.reduce((sum, k) => sum + Math.exp(-((2 * k - 1) ** 2) * theta), 0);
    return clampProbability(1 - lower);
  }
  return clampProbability(2 * terms.reduce((sum, k) => sum + (k % 2 === 1 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda), 0));
}

/** KS.TEST: the two-sided p value of the two-sample Kolmogorov-Smirnov test. Exact by counting
 *  lattice paths up to 10^7 of them, Kolmogorov's limit beyond. An empty sample: #DIV/0!. */
export function kolmogorovSmirnov(first: number[], second: number[]): Result {
  const [m, n] = [first.length, second.length];
  if (m === 0 || n === 0) return DIV_ZERO_ERROR;
  const gap = largestGap(first, second);
  if (gap === 0) return 1;
  if (m * n > KS_EXACT_MAX_PRODUCT) return kolmogorovUpper((gap / (m * n)) * Math.sqrt((m * n) / (m + n)));
  const pooled = Float64Array.from([...first, ...second]).sort();
  const observed = Array.from({ length: m + n + 1 }, (_, count) => count > 0 && pooled[count - 1] !== pooled[count]);
  return clampProbability(ksExactOutside(m, n, gap, observed));
}

// ---------------------------------------------------------------- Shapiro-Wilk

const SW_G = [-2.273, 0.459];
const SW_C1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
const SW_C2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
const SW_C3 = [0.544, -0.39978, 0.025054, -6.714e-4];
const SW_C4 = [1.3822, -0.77857, 0.062767, -0.0020322];
const SW_C5 = [-1.5861, -0.31082, -0.083751, 0.0038915];
const SW_C6 = [-0.4803, -0.082676, 0.0030302];
const SW_MIN_VALUES = 3;
const SW_SMALL_MAX = 11;
const SW_SECOND_COEFFICIENT_FROM = 6;
const SW_SMALLEST_P = 1e-99;

const polynomial = (coefficients: readonly number[], x: number): number => coefficients.reduceRight((sum, coefficient) => sum * x + coefficient, 0);

/** Royston's approximate coefficients a_1..a_(n/2), the weights of the largest values. */
function shapiroCoefficients(n: number): number[] {
  if (n === SW_MIN_VALUES) return [Math.SQRT1_2];
  const half = Math.floor(n / 2);
  const m = Array.from({ length: half }, (_, offset) => normalQuantile((offset + 1 - 0.375) / (n + 0.25)));
  const sumSquares = 2 * m.reduce((sum, value) => sum + value * value, 0);
  const rootSumSquares = Math.sqrt(sumSquares);
  const inverseRoot = 1 / Math.sqrt(n);
  const [m1 = 0, m2 = 0] = m;
  const a1 = polynomial(SW_C1, inverseRoot) - m1 / rootSumSquares;
  if (n < SW_SECOND_COEFFICIENT_FROM) {
    const scale = Math.sqrt((sumSquares - 2 * m1 * m1) / (1 - 2 * a1 * a1));
    return [a1, ...m.slice(1).map((value) => -value / scale)];
  }
  const a2 = -m2 / rootSumSquares + polynomial(SW_C2, inverseRoot);
  const scale = Math.sqrt((sumSquares - 2 * m1 * m1 - 2 * m2 * m2) / (1 - 2 * a1 * a1 - 2 * a2 * a2));
  return [a1, a2, ...m.slice(2).map((value) => -value / scale)];
}

/** 1 − W, as the squared correlation of the sorted values with the coefficients, computed as
 *  AS R94 does so a W very near 1 keeps its digits. */
function shapiroOneMinusW(sorted: Float64Array, coefficients: readonly number[]): number {
  const n = sorted.length;
  const range = (sorted[n - 1] ?? 0) - (sorted[0] ?? 0);
  const weight = (i: number): number => {
    const mirror = n - 1 - i;
    return i === mirror ? 0 : Math.sign(i - mirror) * (coefficients[Math.min(i, mirror)] ?? 0);
  };
  const weights = Array.from(sorted, (_, i) => weight(i));
  const scaled = Array.from(sorted, (value) => value / range);
  const [weightMean, valueMean] = [weights.reduce((sum, w) => sum + w, 0) / n, scaled.reduce((sum, x) => sum + x, 0) / n];
  const sums = weights.reduce(
    (total, w, i) => {
      const [dw, dx] = [w - weightMean, (scaled[i] ?? 0) - valueMean];
      return { ww: total.ww + dw * dw, xx: total.xx + dx * dx, wx: total.wx + dw * dx };
    },
    { ww: 0, xx: 0, wx: 0 },
  );
  const root = Math.sqrt(sums.ww * sums.xx);
  return ((root - sums.wx) * (root + sums.wx)) / (sums.ww * sums.xx);
}

/** The p value for 1 − W: exact for three values, Royston's normalizing transformations above. */
function shapiroProbability(oneMinusW: number, n: number): number {
  if (n === SW_MIN_VALUES) return Math.max(0, (6 / Math.PI) * (Math.asin(Math.sqrt(1 - oneMinusW)) - Math.PI / 3));
  const y = Math.log(oneMinusW);
  if (n <= SW_SMALL_MAX) {
    const gamma = polynomial(SW_G, n);
    if (y >= gamma) return SW_SMALLEST_P;
    const [mean, sd] = [polynomial(SW_C3, n), Math.exp(polynomial(SW_C4, n))];
    return normalCdf(-(-Math.log(gamma - y) - mean) / sd);
  }
  const [mean, sd] = [polynomial(SW_C5, Math.log(n)), Math.exp(polynomial(SW_C6, Math.log(n)))];
  return normalCdf(-(y - mean) / sd);
}

/** SHAPIRO.TEST: the p value of the Shapiro-Wilk test of normality, by Royston's algorithm AS R94
 *  (as R's shapiro.test and scipy.stats.shapiro compute it). Fewer than three values, or values
 *  that never vary: #DIV/0!. */
export function shapiroWilk(values: number[]): Result {
  const n = values.length;
  if (n < SW_MIN_VALUES) return DIV_ZERO_ERROR;
  const sorted = Float64Array.from(values).sort();
  if ((sorted[n - 1] ?? 0) - (sorted[0] ?? 0) === 0) return DIV_ZERO_ERROR;
  const center = sorted[Math.floor(n / 2)] ?? 0;
  const centered = sorted.map((value) => value - center);
  return shapiroProbability(shapiroOneMinusW(centered, shapiroCoefficients(n)), n);
}

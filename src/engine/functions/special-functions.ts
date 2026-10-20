/**
 * The special functions the t and normal distributions are built from: log gamma,
 * log beta, and the regularized incomplete beta and gamma functions. Pure numerics,
 * no spreadsheet types; accurate to a relative error near 1e-15 in the ranges the
 * distribution functions use, which tests/engine/test_distributions.ts checks
 * against values computed at 50 digits.
 */

const LN_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);
const EPSILON = 1e-16;
const TINY = 1e-300;
const MAX_ITERATIONS = 2000;

/** Lentz's guard: a denominator that reaches 0 is moved off it. */
const clamp = (value: number): number => (Math.abs(value) < TINY ? TINY : value);
const STIRLING_FROM = 10;

// Lanczos approximation, g = 7, n = 9.
const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

// Stirling series B(2k) / (2k (2k - 1)), the terms of ln Γ(x) - Stirling's formula.
const STIRLING_TERMS = [1 / 12, -1 / 360, 1 / 1260, -1 / 1680, 1 / 1188, -691 / 360360, 1 / 156, -3617 / 122400];

/** ln Γ(x) minus Stirling's formula, for x >= 10. */
function stirlingCorrection(x: number): number {
  const inverseSquare = 1 / (x * x);
  return STIRLING_TERMS.reduceRight((sum, term) => sum * inverseSquare + term, 0) / x;
}

function lanczosLogGamma(x: number): number {
  const shifted = x - 1;
  const series = LANCZOS.slice(1).reduce((sum, coefficient, index) => sum + coefficient / (shifted + index + 1), LANCZOS[0] ?? 1);
  const t = shifted + LANCZOS_G + 0.5;
  return LN_SQRT_2PI + (shifted + 0.5) * Math.log(t) - t + Math.log(series);
}

/** ln Γ(x) for x > 0. */
export function logGamma(x: number): number {
  if (x >= STIRLING_FROM) return LN_SQRT_2PI + (x - 0.5) * Math.log(x) - x + stirlingCorrection(x);
  return lanczosLogGamma(x);
}

/** ln B(a, b) for a, b > 0. With one argument large (the t distribution's df / 2 beside ½) it is
 *  split like R's lbeta: ln Γ(q) − ln Γ(p + q) cancels once both are large and alike. */
export function logBeta(a: number, b: number): number {
  const p = Math.min(a, b);
  const q = Math.max(a, b);
  if (q >= STIRLING_FROM) {
    const correction = stirlingCorrection(q) - stirlingCorrection(p + q);
    return logGamma(p) + correction + p - p * Math.log(p + q) + (q - 0.5) * Math.log1p(-p / (p + q));
  }
  return logGamma(p) + logGamma(q) - logGamma(p + q);
}

/** Lentz's evaluation of the incomplete beta continued fraction. */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const state = { c: 1, d: 1 / clamp(1 - ((a + b) * x) / (a + 1)), result: 0 };
  state.result = state.d;
  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const even = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    state.d = 1 / clamp(1 + even * state.d);
    state.c = clamp(1 + even / state.c);
    state.result *= state.d * state.c;
    const odd = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    state.d = 1 / clamp(1 + odd * state.d);
    state.c = clamp(1 + odd / state.c);
    const step = state.d * state.c;
    state.result *= step;
    if (Math.abs(step - 1) < EPSILON) return state.result;
  }
  return state.result;
}

// Past this shape the continued fraction loses digits as x nears 1 (the t distribution at
// df = 1e9 lost 8), so a small 1 − x is summed as a power series instead, while (a + b) times it
// stays within the reach.
const SERIES_SHAPE = 1e4;
const SERIES_REACH = 8;

/** I_y(p, q) by the series y^p (1 − y)^q / (p B(p, q)) · Σ (p + q)_n / (p + 1)_n · yⁿ. Every term
 *  is positive, so nothing cancels; it converges once n passes (p + q) y. */
function betaPowerSeries(y: number, logY: number, logOneMinusY: number, p: number, q: number): number {
  const state = { term: 1, sum: 1 };
  for (let n = 0; n < MAX_ITERATIONS && state.term > state.sum * EPSILON; n += 1) {
    state.term *= ((p + q + n) / (p + 1 + n)) * y;
    state.sum += state.term;
  }
  return (Math.exp(p * logY + q * logOneMinusY - logBeta(p, q)) / p) * state.sum;
}

/** I_x(a, b) from ln x and ln(1 − x). Taking logs lets a caller pass an x, or a 1 − x, too small
 *  for a double (t above 1e154 in the t distribution) without the front factor collapsing to 0. */
export function regularizedBetaFromLogs(logX: number, logComplement: number, a: number, b: number): number {
  if (logX === -Infinity) return 0;
  if (logComplement === -Infinity) return 1;
  const x = Math.exp(logX);
  const complement = Math.exp(logComplement);
  // 1 − (the series) cancels as the answer shrinks; the reach bounds the digits it can lose.
  if (Math.max(a, b) >= SERIES_SHAPE && complement * (a + b) <= SERIES_REACH) return 1 - betaPowerSeries(complement, logComplement, logX, b, a);
  const front = Math.exp(a * logX + b * logComplement - logBeta(a, b));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(complement, b, a)) / b;
}

/** P(a, x) by its power series, accurate for x < a + 1. */
function lowerGammaSeries(a: number, x: number): number {
  const state = { term: 1 / a, sum: 1 / a };
  for (let n = 1; n <= MAX_ITERATIONS && Math.abs(state.term) >= Math.abs(state.sum) * EPSILON; n += 1) {
    state.term *= x / (a + n);
    state.sum += state.term;
  }
  return state.sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Q(a, x) by Lentz's continued fraction, accurate for x >= a + 1. */
function upperGammaFraction(a: number, x: number): number {
  const state = { b: x + 1 - a, c: 1 / TINY, d: 0, result: 0 };
  state.d = 1 / clamp(state.b);
  state.result = state.d;
  for (let n = 1; n <= MAX_ITERATIONS; n += 1) {
    const an = -n * (n - a);
    state.b += 2;
    state.d = 1 / clamp(an * state.d + state.b);
    state.c = clamp(state.b + an / state.c);
    const step = state.d * state.c;
    state.result *= step;
    if (Math.abs(step - 1) < EPSILON) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * state.result;
}

/** Q(a, x) = Γ(a, x) / Γ(a), the regularized upper incomplete gamma function. */
export function regularizedGammaUpper(a: number, x: number): number {
  if (x <= 0) return 1;
  return x < a + 1 ? 1 - lowerGammaSeries(a, x) : upperGammaFraction(a, x);
}

/** P(a, x) = γ(a, x) / Γ(a), the regularized lower incomplete gamma function: each side from the
 *  expansion that is accurate there, so a small P is not 1 − Q's cancellation. */
export function regularizedGammaLower(a: number, x: number): number {
  if (x <= 0) return 0;
  return x < a + 1 ? lowerGammaSeries(a, x) : 1 - upperGammaFraction(a, x);
}

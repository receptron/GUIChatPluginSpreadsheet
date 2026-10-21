/**
 * Autocorrelation at every lag at once, through the fast Fourier transform: Σ xₜxₜ₊ₖ for each k in
 * O(n log n) rather than O(n) per lag.
 */

/** `index` with its lowest `bits` bits in reverse order. */
const bitReversed = (index: number, bits: number): number =>
  Array.from({ length: bits }).reduce<number>((reversed, _, bit) => (reversed << 1) | ((index >> bit) & 1), 0);

/** The discrete Fourier transform of `re` + i·`im` in place (radix 2; the length a power of 2). */
function transform(re: Float64Array, im: Float64Array): void {
  const size = re.length;
  const bits = Math.round(Math.log2(size));
  re.forEach((_, index) => {
    const partner = bitReversed(index, bits);
    if (partner <= index) return;
    [re[index], re[partner]] = [re[partner] ?? 0, re[index] ?? 0];
    [im[index], im[partner]] = [im[partner] ?? 0, im[index] ?? 0];
  });
  Array.from({ length: bits }, (_, stage) => 1 << stage).forEach((half) => {
    const angle = -Math.PI / half;
    const twiddles = Array.from({ length: half }, (_, k): [number, number] => [Math.cos(angle * k), Math.sin(angle * k)]);
    Array.from({ length: size / (2 * half) }, (_, block) => block * 2 * half).forEach((start) => butterflies(re, im, start, half, twiddles));
  });
}

/** One block of one stage: each pair `half` apart combined with its twiddle factor. */
function butterflies(re: Float64Array, im: Float64Array, start: number, half: number, twiddles: readonly (readonly [number, number])[]): void {
  twiddles.forEach(([cos, sin], k) => {
    const [top, bottom] = [start + k, start + k + half];
    const [bottomRe, bottomIm] = [re[bottom] ?? 0, im[bottom] ?? 0];
    const [turnedRe, turnedIm] = [cos * bottomRe - sin * bottomIm, cos * bottomIm + sin * bottomRe];
    const [topRe, topIm] = [re[top] ?? 0, im[top] ?? 0];
    [re[top], im[top], re[bottom], im[bottom]] = [topRe + turnedRe, topIm + turnedIm, topRe - turnedRe, topIm - turnedIm];
  });
}

/** Σₜ xₜxₜ₊ₖ for k from 0 to `maxLag`: the inverse transform of the power spectrum of the values
 *  padded with zeros to at least twice their length, so no product wraps around. */
export function lagProducts(values: readonly number[], maxLag: number): number[] {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2 * values.length, 2)));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  values.forEach((value, index) => (re[index] = value));
  transform(re, im);
  re.forEach((value, index) => {
    re[index] = value * value + (im[index] ?? 0) ** 2;
    im[index] = 0;
  });
  // The power spectrum is real and even, so the forward transform inverts it as well (times n).
  transform(re, im);
  return Array.from({ length: maxLag + 1 }, (_, lag) => (re[lag] ?? 0) / size);
}

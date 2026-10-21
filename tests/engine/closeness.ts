// Comparing a calculated number with the one expected.

import assert from "node:assert/strict";

export const RELATIVE_TOLERANCE = 1e-9;

/** `actual` is a number within a relative error of `tolerance` of `expected` (absolute below 1). */
export function assertRelativelyClose(actual: unknown, expected: number, label: string, tolerance = RELATIVE_TOLERANCE): void {
  assert.equal(typeof actual, "number", `${label}: ${String(actual)}`);
  const error = Math.abs(Number(actual) - expected) / Math.max(Math.abs(expected), 1);
  assert.ok(error <= tolerance, `${label}: ${String(actual)} vs ${expected} (error ${error.toExponential(2)})`);
}

/** `actual` is a number less than `tolerance` from `expected`. */
export function assertWithin(actual: unknown, expected: number, tolerance: number): void {
  assert.equal(typeof actual, "number", `expected a number, got ${String(actual)}`);
  assert.ok(Math.abs(Number(actual) - expected) < tolerance, `${String(actual)} is not ${expected}`);
}

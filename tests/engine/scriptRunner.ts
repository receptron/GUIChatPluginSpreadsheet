// The plain runner the tsx scripts share: each test prints ✓ or ✗, and the summary exits 1 when any
// failed.

export interface ScriptRunner {
  test(name: string, fn: () => void): void;
  /** Print the totals and the failures, then exit: 1 when a test failed, 0 otherwise. */
  finish(): never;
}

/** A runner; with `printErrors`, a failure's message is printed under its name as it happens. */
export function scriptRunner({ printErrors = false } = {}): ScriptRunner {
  const tally: { passed: number; failed: number; failures: string[] } = { passed: 0, failed: 0, failures: [] };
  return {
    test(name, fn) {
      try {
        fn();
        tally.passed++;
        console.log(`✓ ${name}`);
      } catch (error) {
        tally.failed++;
        const message = error instanceof Error ? error.message : String(error);
        tally.failures.push(`✗ ${name}: ${message}`);
        console.log(`✗ ${name}`);
        if (printErrors) console.error(`  ${message}`);
      }
    },
    finish() {
      console.log("\n=== Test Summary ===");
      console.log(`Passed: ${tally.passed}`);
      console.log(`Failed: ${tally.failed}`);
      if (tally.failures.length > 0) {
        console.log("\n=== Failures ===");
        tally.failures.forEach((failure) => console.log(failure));
        process.exit(1);
      }
      console.log("\n✓ All tests passed!");
      process.exit(0);
    },
  };
}

/** `expect(actual).toBe(expected)` (the same value) and `.toEqual(expected)` (the same JSON), throwing
 *  when they differ. */
export function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) throw new Error(`Expected "${String(expected)}", got "${String(actual)}"`);
    },
    toEqual(expected: unknown) {
      const [actualJson, expectedJson] = [JSON.stringify(actual), JSON.stringify(expected)];
      if (actualJson !== expectedJson) throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
    },
  };
}

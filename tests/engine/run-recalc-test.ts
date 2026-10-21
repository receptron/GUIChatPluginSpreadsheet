/**
 * Test for re-calculation scenarios that might cause infinite loops
 */

import assert from "node:assert/strict";
import { SpreadsheetEngine } from "../../src/engine/engine";
import { pvAnalysisData, expectedPvAnalysisTotal } from "./test-utils";
import type { SheetData } from "../../src/engine/types";
import "../../src/engine/functions";

console.log("\n=== Re-calculation Test ===\n");

const engine = new SpreadsheetEngine();

// Simulate what the Vue component does
function calculateFormulas(data: Array<Array<any>>, sheetName?: string, allSheets?: SheetData[]): Array<Array<any>> {
  const sheet: SheetData = {
    name: sheetName || "Sheet1",
    data,
  };

  const result = engine.calculate(sheet, allSheets);
  return result.data as Array<Array<any>>;
}

try {
  console.log("Test 1: Single calculation");
  const result1 = calculateFormulas(pvAnalysisData, "PV Analysis");
  console.log("✓ First calculation succeeded");
  console.log("  Total PV:", result1[4][1]);
  assert.equal(result1[4][1], expectedPvAnalysisTotal(), "first calculation");

  console.log("\nTest 2: Re-calculate same data");
  const result2 = calculateFormulas(pvAnalysisData, "PV Analysis");
  console.log("✓ Second calculation succeeded");
  console.log("  Total PV:", result2[4][1]);
  assert.equal(result2[4][1], expectedPvAnalysisTotal(), "recalculating the same data");

  console.log("\nTest 3: Calculate with formatted results (simulate re-render)");
  // This simulates if the calculated results are passed back in
  const result3 = calculateFormulas(result1, "PV Analysis");
  console.log("✓ Third calculation succeeded");
  console.log("  Total PV:", result3[4][1]);
  assert.equal(result3[4][1], expectedPvAnalysisTotal(), "recalculating already-calculated output");

  console.log("\nTest 4: Multiple rapid calculations (simulate reactive updates)");
  for (let i = 0; i < 10; i++) {
    const result = calculateFormulas(pvAnalysisData, "PV Analysis");
    console.log(`  Iteration ${i + 1}: ${result[4][1]}`);
    assert.equal(result[4][1], expectedPvAnalysisTotal(), `rapid recalculation ${i + 1}`);
  }
  console.log("✓ Rapid calculations succeeded");

  console.log("\n✓ All re-calculation tests passed - no infinite loops detected");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Test failed:");
  console.error(error);
  process.exit(1);
}

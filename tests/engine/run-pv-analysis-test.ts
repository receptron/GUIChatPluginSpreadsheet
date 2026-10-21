/**
 * Test for PV Analysis infinite loop bug
 */

import assert from "node:assert/strict";
import { calculateSheet } from "../../src/engine/calculator";
import { pvAnalysisData, expectedPvAnalysisTotal } from "./test-utils";
import "../../src/engine/functions"; // Load all functions

console.log("\n=== PV Analysis Test ===\n");

const pvAnalysisSheet = {
  name: "PV Analysis",
  data: pvAnalysisData,
};

try {
  console.log("Testing PV Analysis sheet calculation...");
  console.log("This test will timeout after 5 seconds if there's an infinite loop");

  const timeout = setTimeout(() => {
    console.error("\n❌ TIMEOUT: Infinite loop detected!");
    console.error("The calculation did not complete within 5 seconds");
    process.exit(1);
  }, 5000);

  const startTime = Date.now();
  const result = calculateSheet(pvAnalysisSheet);
  const endTime = Date.now();

  clearTimeout(timeout);

  console.log(`✓ Calculation completed in ${endTime - startTime}ms`);
  console.log("\nResults:");
  console.log("Monthly Discount Rate (B4):", result.data[3][1]);
  console.log("Total Present Value (B5):", result.data[4][1]);
  console.log("\nFirst few months:");
  for (let i = 8; i <= 11; i++) {
    console.log(`Month ${result.data[i][0]}: Cash Flow ${result.data[i][1]}, PV ${result.data[i][2]}`);
  }

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach((error) => {
      console.log(`  ${error.cell.row},${error.cell.col}: ${error.error}`);
    });
  }

  assert.deepEqual(result.errors, [], "the sheet calculates without errors");
  assert.equal(result.data[4][1], expectedPvAnalysisTotal(), "Total Present Value (B5)");

  console.log("\n✓ Test passed - no infinite loop");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Test failed with error:");
  console.error(error);
  process.exit(1);
}

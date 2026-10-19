// What presentSpreadsheet tells the agent about the workbook it made, and a workbook that once
// took QuickJS down with it. The stress test behind both: receptron/mulmoterminal#3113.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { calculationErrors, calculationErrorsNote, ERROR_SAMPLES, FORMULA_QUOTE_LIMIT } from "../../src/core/calculationErrors.js";
import { calculatedRange } from "../../src/core/rangeValues.js";
import { executeSpreadsheet } from "../../src/core/plugin.js";
import { loadCustomFunctions } from "../../src/engine/customFunctions.js";
import type { SpreadsheetSheet } from "../../src/core/types.js";

const sheet = (rows: (string | number)[][], name = "S"): SpreadsheetSheet => ({ name, data: rows.map((row) => row.map((v) => ({ v }))) });

describe("calculationErrors", () => {
  it("is empty for a workbook that calculates", () => {
    const result = calculationErrors([sheet([[1, "=A1*2"]])]);
    assert.deepEqual(result, { count: 0, samples: [] });
    assert.equal(calculationErrorsNote(result), "");
  });

  it("names a formula cell that calculates to an error, with its formula", () => {
    const result = calculationErrors([
      sheet([
        [0, "=1/A1"],
        ["x", "=VLOOKUP(9,A1:A2,1,FALSE)"],
      ]),
    ]);
    assert.equal(result.count, 2);
    assert.deepEqual(result.samples, ["S!B1 = #DIV/0! (=1/A1)", "S!B2 = #N/A (=VLOOKUP(9,A1:A2,1,FALSE))"]);
  });

  it("does not count text that merely spells an error, typed or returned by a formula", () => {
    assert.equal(calculationErrors([sheet([["#N/A", "#DIV/0!", '="#N/A"', '=IF(1>0,"#VALUE!","")']])]).count, 0);
  });

  it("quotes a long formula only in part", () => {
    const long = `=1/(${"0+".repeat(100)}0)`;
    const [sample] = calculationErrors([sheet([[long]])]).samples;
    assert.ok(sample !== undefined && sample.length < long.length);
    assert.match(sample, new RegExp(`\\(=1/\\(0\\+.{${FORMULA_QUOTE_LIMIT - 6}}…\\)$`));
  });

  it("names at most a few and counts the rest", () => {
    const rows = Array.from({ length: ERROR_SAMPLES + 3 }, () => ["=1/0"]);
    const result = calculationErrors([sheet(rows)]);
    assert.equal(result.count, ERROR_SAMPLES + 3);
    assert.equal(result.samples.length, ERROR_SAMPLES);
    assert.match(calculationErrorsNote(result), /and 3 more\.$/);
  });

  it("calculates the workbook's own functions", async () => {
    const workbook: SpreadsheetSheet[] = [
      {
        ...sheet([["=OK()", "=BAD()"]]),
        functions: [
          { name: "OK", params: [], body: "return 1;" },
          { name: "BAD", params: [], body: "throw new Error('no');" },
        ],
      },
    ];
    const functions = await loadCustomFunctions(workbook);
    assert.deepEqual(calculationErrors(workbook, functions).samples, ["S!B1 = #VALUE! (=BAD())"]);
    functions.dispose();
  });
});

describe("presentSpreadsheet's reply", () => {
  it("says which cells calculate to an error", async () => {
    const result = await executeSpreadsheet({}, { title: "t", sheets: [sheet([[0, "=1/A1"]])] });
    assert.match(result.message ?? "", /1 formula cell\(s\) calculate to an error.*S!B1 = #DIV\/0! \(=1\/A1\)/);
  });

  it("says nothing more for a workbook without errors", async () => {
    const result = await executeSpreadsheet({}, { title: "t", sheets: [sheet([[1, "=A1+1"]])] });
    assert.equal(result.message, "Created spreadsheet: t");
  });
});

// Generated stress-test data: two sheets that refer to each other, with workbook functions. Reading
// it ran the calculation out of time, and freeing that QuickJS runtime aborted the module every set
// shared, so each later read threw `RuntimeError: Aborted(Assertion failed: list_empty(…))`.
describe("a workbook that ran QuickJS out of time", () => {
  const workbook: SpreadsheetSheet[] = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/rfm-mutual-sheets.json"), "utf8"));

  it("can be read again and again without taking later reads down", async () => {
    for (const range of ["RFM!A1:J121", "Settings!A1:H11", "Summary!A1:D8"]) {
      const functions = await loadCustomFunctions(workbook);
      const rows = calculatedRange(workbook, range, functions);
      assert.doesNotThrow(() => functions.dispose());
      assert.ok(rows.length > 0, `${range} came back`);
    }
    const fresh = await loadCustomFunctions([{ functions: [{ name: "AFTER", params: [], body: "return 7;" }] }]);
    assert.equal(fresh.definitions.has("AFTER"), true);
    fresh.dispose();
  });
});

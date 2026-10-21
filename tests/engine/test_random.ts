// RAND, RANDBETWEEN and RANDARRAY: the numbers hold still from one calculation to the next, differ
// from cell to cell and call to call, lie where they should, and are spread evenly.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import { functionRegistry } from "../../src/engine/registry.ts";
import { hashKey, randomBetween, randomTable, uniformStream } from "../../src/engine/functions/random-math.ts";
import { CALC_ERROR, NUM_ERROR, VALUE_ERROR } from "../../src/engine/spreadsheet-errors.ts";

const calculate = (rows: string[][], name = "S"): CellValue[][] =>
  new SpreadsheetEngine().calculateWorkbook([{ name, data: rows.map((row) => row.map((v) => ({ v }))) }])[0]?.data ?? [];

describe("RAND, RANDBETWEEN and RANDARRAY in a sheet", () => {
  it("answer the same numbers each time the workbook is calculated", () => {
    const rows = [
      ["=RAND()", "=RANDBETWEEN(1,6)", "=RANDARRAY(2,2)"],
      ["", "", ""],
      ["", "", ""],
    ];
    assert.deepEqual(calculate(rows), calculate(rows));
  });

  it("differ from cell to cell, from call to call in one formula, and from sheet to sheet", () => {
    const [[first, second, pair]] = calculate([["=RAND()", "=RAND()", "=RAND()-RAND()"]]);
    assert.notEqual(first, second);
    assert.notEqual(pair, 0);
    const [[onOther]] = calculate([["=RAND()"]], "Other");
    assert.notEqual(onOther, first);
  });

  it("lie in range: RAND in [0, 1), RANDBETWEEN whole and between its bounds, RANDARRAY within min and max", () => {
    const rows = Array.from({ length: 40 }, () => ["=RAND()", "=RANDBETWEEN(-2,3)", "=RANDBETWEEN(1.2,3.8)"]);
    calculate(rows).forEach(([rand, between, rounded]) => {
      assert.ok(typeof rand === "number" && rand >= 0 && rand < 1, String(rand));
      assert.ok(Number.isInteger(between) && Number(between) >= -2 && Number(between) <= 3, String(between));
      assert.ok(rounded === 2 || rounded === 3, String(rounded));
    });
    const table = calculate([["=RANDARRAY(5,3,10,20,TRUE)"]]);
    assert.equal(table.length, 5);
    table.forEach((row) => row.forEach((cell) => assert.ok(Number.isInteger(cell) && Number(cell) >= 10 && Number(cell) <= 20, String(cell))));
  });

  it("RANDARRAY's numbers lie from 0 up to 1 when min and max are left out", () => {
    calculate([["=RANDARRAY(200,1)"]]).forEach(([cell]) => assert.ok(typeof cell === "number" && cell >= 0 && cell < 1, String(cell)));
  });

  it("RANDARRAY with nothing given is one number, and is read by other functions", () => {
    const [[single, summed]] = calculate([["=RANDARRAY()", "=SUM(RANDARRAY(4,1,1,2,TRUE))"]]);
    assert.ok(typeof single === "number" && single >= 0 && single < 1);
    assert.ok(typeof summed === "number" && summed >= 4 && summed <= 8, String(summed));
  });

  it("outside a cell, draw the same number every time", () => {
    const rand = functionRegistry.get("RAND");
    const context = { functionName: "RAND", getCellValue: () => 0, getRangeValues: () => [], evaluateFormula: () => 0 };
    assert.equal(rand?.handler([], context), rand?.handler([], context));
  });

  it("answer the argument errors", () => {
    assert.deepEqual(
      calculate([["=RANDBETWEEN(5,1)", "=RANDBETWEEN(1.5,1.7)", "=RANDARRAY(2,2,5,1)", "=RANDARRAY(0)", "=RANDARRAY(2,2,0.5,3,TRUE)", '=RANDBETWEEN("x",2)']]),
      [["#NUM!", "#NUM!", "#VALUE!", "#CALC!", "#VALUE!", "#VALUE!"]],
    );
  });
});

const fixed = (): number => 0.5;

describe("the rules", () => {
  it("randomBetween includes both bounds, rounding bottom up and top down", () => {
    assert.equal(randomBetween(1, 6, 0), 1);
    assert.equal(randomBetween(1, 6, 0.999999), 6);
    assert.equal(randomBetween(1.2, 3.8, 0), 2);
    assert.equal(randomBetween(1.2, 3.8, 0.999999), 3);
    assert.equal(randomBetween(3, 2, 0.5), NUM_ERROR);
  });

  it("randomTable's sizes and bounds", () => {
    assert.deepEqual(randomTable(1, 2, 0, 10, false, fixed), [[5, 5]]);
    assert.deepEqual(randomTable(2.9, 1, 1, 3, true, fixed), [[2], [2]]);
    // Each whole number takes an equal third of [0, 1): 0.3 falls in the first.
    assert.deepEqual(
      randomTable(1, 2, 1, 3, true, () => 0.3),
      [[1, 1]],
    );
    assert.deepEqual(
      randomTable(1, 2, 1, 3, true, () => 0.999),
      [[3, 3]],
    );
    assert.equal(randomTable(0, 3, 0, 1, false, fixed), CALC_ERROR);
    assert.equal(randomTable(-1, 3, 0, 1, false, fixed), VALUE_ERROR);
    assert.equal(randomTable(2, 2, 2, 1, false, fixed), VALUE_ERROR);
    assert.equal(randomTable(2, 2, 1, 1, true, fixed), VALUE_ERROR, "Microsoft: min must be below max");
    assert.equal(randomTable(2, 2, 0, 1.5, true, fixed), VALUE_ERROR);
    assert.equal(randomTable(2_000_000, 1, 0, 1, false, fixed), VALUE_ERROR);
  });

  it("the stream is spread evenly: a chi-square over ten bins stays below its 0.1% critical value", () => {
    const BINS = 10;
    const DRAWS = 100_000;
    const CRITICAL_0_1_PERCENT_9_DF = 27.88;
    const next = uniformStream(hashKey("uniformity"));
    const counts = Array.from({ length: BINS }, () => 0);
    Array.from({ length: DRAWS }).forEach(() => {
      const bin = Math.floor(next() * BINS);
      counts[bin] = (counts[bin] ?? 0) + 1;
    });
    const expected = DRAWS / BINS;
    const chiSquare = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    assert.ok(chiSquare < CRITICAL_0_1_PERCENT_9_DF, `chi-square ${chiSquare}`);
  });

  it("hashKey is FNV-1a over UTF-8 bytes", () => {
    assert.equal(hashKey("a"), 0xe40c292c);
    assert.equal(hashKey("é"), 513665217);
  });

  it("hashKey tells keys apart that differ in one character", () => {
    assert.notEqual(hashKey("S\u00000\u00000\u00000"), hashKey("S\u00000\u00000\u00001"));
  });
});

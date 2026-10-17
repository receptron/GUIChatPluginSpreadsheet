import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSheet, readSheets } from "../../src/core/sheetGuards.js";

describe("isSheet", () => {
  it("accepts every stored cell form", () => {
    const data = [[{ v: "a" }, { v: 1, f: "#,##0" }, { v: true }, {}, { v: null }, { f: "0.00" }, "bare", 2, false, null]];
    assert.equal(isSheet({ name: "S", data }), true);
  });

  it("accepts an empty grid and empty rows", () => {
    assert.equal(isSheet({ name: "S", data: [] }), true);
    assert.equal(isSheet({ name: "S", data: [[]] }), true);
  });

  const rejected: [string, unknown][] = [
    ["null", null],
    ["array", []],
    ["missing name", { data: [] }],
    ["numeric name", { name: 1, data: [] }],
    ["missing data", { name: "S" }],
    ["data not an array", { name: "S", data: "x" }],
    ["row not an array", { name: "S", data: [{ v: 1 }] }],
    ["object value", { name: "S", data: [[{ v: { nested: 1 } }]] }],
    ["array value", { name: "S", data: [[{ v: [1] }]] }],
    ["numeric format", { name: "S", data: [[{ v: 1, f: 2 }]] }],
    ["undefined cell", { name: "S", data: [[undefined]] }],
    ["nested array cell", { name: "S", data: [[[1]]] }],
  ];
  rejected.forEach(([label, value]) => {
    it(`rejects ${label}`, () => assert.equal(isSheet(value), false));
  });
});

describe("readSheets", () => {
  const good = { name: "A", data: [[{ v: 1 }]] };

  it("returns the workbook when every sheet is valid", () => {
    assert.deepEqual(readSheets([good, { name: "B", data: [] }]), [good, { name: "B", data: [] }]);
  });

  it("accepts an empty workbook", () => {
    assert.deepEqual(readSheets([]), []);
  });

  it("rejects the whole workbook when one sheet is invalid", () => {
    assert.equal(readSheets([good, { name: "B" }]), null);
  });

  it("rejects non-arrays", () => {
    [null, undefined, "artifacts/spreadsheets/x.json", { sheets: [good] }, 1].forEach((value) => {
      assert.equal(readSheets(value), null);
    });
  });
});

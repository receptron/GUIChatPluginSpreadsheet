import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FileOps } from "gui-chat-protocol";
import { calculatedRange, MAX_RANGE_CELLS, readCalculatedRange } from "../../src/core/index.js";
import { parseRange, rangeCellValue } from "../../src/core/rangeValues.js";
import type { SpreadsheetSheet } from "../../src/core/types.js";

const DATA: SpreadsheetSheet = {
  name: "Data",
  data: [
    [{ v: "Month" }, { v: "Sales" }, { v: "Share" }],
    [{ v: "2026-01-15" }, { v: 1200, f: "#,##0" }, { v: "=B2/SUM(B2:B3)", f: "0.0%" }],
    [{ v: "2026-02-15" }, { v: 800 }, { v: "=B3/SUM(B2:B3)", f: "0.0%" }],
    [{ v: "Total" }, { v: "=SUM(B2:B3)", f: "$#,##0" }, { v: "=1/0" }],
  ],
};

const SUMMARY: SpreadsheetSheet = {
  name: "Q1 Summary",
  data: [[{ v: "Doubled" }, { v: "=Data!B4*2" }]],
};

const WORKBOOK = [DATA, SUMMARY];

describe("parseRange", () => {
  it("reads a sheet-qualified range as 0-based inclusive bounds", () => {
    assert.deepEqual(parseRange("Data!B2:C4"), { sheetName: "Data", startRow: 1, endRow: 3, startCol: 1, endCol: 2 });
  });

  it("reads a quoted sheet name, a single cell, and no sheet", () => {
    assert.equal(parseRange("'Q1 Summary'!A1:B1")?.sheetName, "Q1 Summary");
    assert.deepEqual(parseRange("B2"), { sheetName: null, startRow: 1, endRow: 1, startCol: 1, endCol: 1 });
  });

  it("orders reversed corners", () => {
    assert.deepEqual(parseRange("C4:B2"), parseRange("B2:C4"));
  });

  it("rejects what is not a range", () => {
    ["", "Data!", "hello", "A:A", "1:3", "Data!A1:"].forEach((text) => assert.equal(parseRange(text), null, text));
  });
});

describe("rangeCellValue", () => {
  it("keeps the number under a number format, so it can be plotted", () => {
    assert.equal(rangeCellValue({ v: 1200, f: "#,##0" }, 1200, "1,200"), 1200);
    assert.equal(rangeCellValue({ v: "=x", f: "0.0%" }, 0.6, "60.0%"), 0.6);
  });

  it("keeps the displayed text of a date, not its serial", () => {
    assert.equal(rangeCellValue({ v: "=DATE(2026,1,2)", f: "YYYY-MM-DD" }, 46024, "2026-01-02"), "2026-01-02");
    assert.equal(rangeCellValue({ v: "=DATE(2026,1,2)" }, 46024, "01/02/2026"), "01/02/2026");
  });

  it("passes plain numbers and text through, and reads blanks as null", () => {
    assert.equal(rangeCellValue({ v: 800 }, 800, 800), 800);
    assert.equal(rangeCellValue({ v: "East" }, "East", "East"), "East");
    assert.equal(rangeCellValue({ v: "" }, "", ""), null);
    assert.equal(rangeCellValue(undefined, undefined, undefined), null);
  });

  it("shows a boolean as TRUE / FALSE", () => {
    assert.equal(rangeCellValue({ v: true }, true, true), "TRUE");
  });
});

describe("calculatedRange", () => {
  it("returns calculated values, numbers kept as numbers", () => {
    assert.deepEqual(calculatedRange(WORKBOOK, "Data!A1:C3"), [
      ["Month", "Sales", "Share"],
      ["2026-01-15", 1200, 0.6],
      ["2026-02-15", 800, 0.4],
    ]);
  });

  it("gives an error cell its code", () => {
    assert.deepEqual(calculatedRange(WORKBOOK, "Data!B4:C4"), [[2000, "#DIV/0!"]]);
  });

  it("follows a reference into another sheet, and reads the first sheet without a prefix", () => {
    assert.deepEqual(calculatedRange(WORKBOOK, "'Q1 Summary'!B1"), [[4000]]);
    assert.deepEqual(calculatedRange(WORKBOOK, "B3"), [[800]]);
  });

  it("fills cells beyond the data with null, keeping the rectangle", () => {
    assert.deepEqual(calculatedRange(WORKBOOK, "Data!C4:D5"), [
      ["#DIV/0!", null],
      [null, null],
    ]);
  });

  it("throws for an unknown sheet, a malformed range, or too many cells", () => {
    assert.throws(() => calculatedRange(WORKBOOK, "Nope!A1:B2"), /no sheet named "Nope"/);
    assert.throws(() => calculatedRange(WORKBOOK, "A:A"), /not a range/);
    assert.throws(() => calculatedRange(WORKBOOK, `A1:A${MAX_RANGE_CELLS + 1}`), /limit/);
    assert.throws(() => calculatedRange([], "A1"), /no sheet/);
  });

  it("accepts a range at the cell limit", () => {
    assert.equal(calculatedRange(WORKBOOK, `A1:A${MAX_RANGE_CELLS}`).length, MAX_RANGE_CELLS);
  });
});

const filesHolding = (store: Record<string, string>): FileOps => ({
  read: async (rel) => {
    const content = store[rel];
    if (content === undefined) throw new Error(`ENOENT: ${rel}`);
    return content;
  },
  readBytes: async () => new Uint8Array(),
  write: async () => {},
  readDir: async () => [],
  stat: async () => ({ mtimeMs: 0, size: 0 }),
  exists: async (rel) => rel in store,
  unlink: async () => {},
});

describe("readCalculatedRange", () => {
  const PATH = "artifacts/spreadsheets/2026/10/abc.json";

  it("reads the saved workbook through files.artifacts", async () => {
    const artifacts = filesHolding({ "spreadsheets/2026/10/abc.json": JSON.stringify(WORKBOOK) });
    assert.deepEqual(await readCalculatedRange(artifacts, PATH, "Data!B2:B3"), [[1200], [800]]);
  });

  it("refuses a path outside artifacts/spreadsheets/", async () => {
    const artifacts = filesHolding({});
    await assert.rejects(readCalculatedRange(artifacts, "artifacts/charts/x.json", "A1"), /artifacts\/spreadsheets/);
    await assert.rejects(readCalculatedRange(artifacts, "artifacts/spreadsheets/../secret.json", "A1"), /artifacts\/spreadsheets/);
  });

  it("refuses a file that does not hold sheets", async () => {
    const artifacts = filesHolding({ "spreadsheets/2026/10/abc.json": JSON.stringify({ sheets: [] }) });
    await assert.rejects(readCalculatedRange(artifacts, PATH, "A1"), /does not hold an array of sheets/);
  });
});

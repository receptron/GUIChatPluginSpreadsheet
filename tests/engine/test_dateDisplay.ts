// A formula without a format shows a date only when its number is a date by origin: it starts
// with a date function, or its first reference is a date. Deciding by size alone showed a sum
// of 52,345 as 04/22/2043.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formulaShowsDate, leadingCall, type DateCell, type DateSource } from "../../src/engine/dateDisplay.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";

describe("leadingCall", () => {
  it("names the function a formula starts with, past brackets, signs and spaces", () => {
    assert.equal(leadingCall("DATE(2025,1,2)"), "DATE");
    assert.equal(leadingCall("date(2025,1,2)+1"), "DATE");
    assert.equal(leadingCall("((EDATE(A1,1)))"), "EDATE");
    assert.equal(leadingCall(" -TODAY()"), "TODAY");
    assert.equal(leadingCall("T.DIST.2T(1,2)"), "T.DIST.2T");
  });

  it("is null when the formula starts with anything else", () => {
    assert.equal(leadingCall("A1+DATE(2025,1,2)"), null);
    assert.equal(leadingCall("1+DATE(2025,1,2)"), null);
    assert.equal(leadingCall('"DATE(" & 1'), null);
    assert.equal(leadingCall(""), null);
  });
});

/** A source over `cells`, keyed `Sheet!A1`. */
const sourceOf =
  (cells: Record<string, Partial<DateCell>>): DateSource =>
  (ref, sheet) => {
    const [target, address] = ref.includes("!") ? ref.replace(/'/g, "").split("!") : [sheet, ref];
    const cell = cells[`${target}!${(address ?? "").replace(/\$/g, "")}`];
    return cell ? { format: cell.format ?? "", formula: cell.formula ?? null, sheet: target ?? sheet } : null;
  };

describe("formulaShowsDate", () => {
  const source = sourceOf({
    "S!A1": { format: "MM/DD/YYYY" },
    "S!H1": { format: "hh" },
    "S!B1": { format: "$#,##0.00" },
    "S!C1": { formula: "=DATE(2025,1,2)" },
    "S!D1": { formula: "=C1+1" },
    "S!E1": { formula: "=F1" },
    "S!F1": { formula: "=E1" },
    "S!G1": {},
    "Data!A1": { format: "YYYY-MM-DD" },
    "Data!B1": { formula: "=C2+7" },
    "Data!C2": { format: "DD/MM/YYYY" },
  });
  const shows = (formula: string): boolean => formulaShowsDate(formula, "S", source);

  it("is true for a formula that starts with a date function", () => {
    ["=DATE(2025,1,2)", "=DATE(2025,1,2)+1", "=(TODAY())", "=EDATE(B1,1)", "=EOMONTH(G1,0)", "=WORKDAY(G1,5)"].forEach((formula) =>
      assert.equal(shows(formula), true, formula),
    );
  });

  it("is true when the first reference has a date format", () => {
    assert.equal(shows("=A1+30"), true);
    assert.equal(shows("=$A$1+30"), true);
    assert.equal(shows("=MAX(A1:A9)"), true);
    assert.equal(shows("=1+A1"), true, "the first reference, not the first term");
  });

  it("is true when the first reference has a time-only format", () => {
    assert.equal(shows("=H1+1/24"), true);
  });

  it("follows the first reference into a formula that shows a date", () => {
    assert.equal(shows("=C1+1"), true);
    assert.equal(shows("=D1+1"), true, "two steps");
  });

  it("reads another sheet, and that sheet's own references", () => {
    assert.equal(shows("=Data!A1+1"), true);
    assert.equal(shows("='Data'!A1+1"), true);
    assert.equal(shows("=Data!B1"), true, "Data!B1 reads Data!C2; S has no C2");
  });

  it("is false otherwise", () => {
    ["=40000+1", "=211^2", "=SUM(G1:G9)", "=B1*2", "=G1+A1", "=IF(TRUE,DATE(2025,1,2),0)", '="A1"&1', "=Z9+1", "=NOW()"].forEach((formula) =>
      assert.equal(shows(formula), false, formula),
    );
  });

  it("stops on a cycle", () => {
    assert.equal(shows("=E1"), false);
  });
});

const displayed = (row: SheetData["data"][number]): unknown[] => {
  const grid = new SpreadsheetEngine().calculate({ name: "S", data: [row] } satisfies SheetData).data;
  return row.map((_, col) => cellAt(grid, 0, col));
};

describe("what a formula without a format shows", () => {
  it("keeps a total in the date window a number, as in the issue", () => {
    assert.deepEqual(displayed([{ v: 52345 }, { v: "=40000+1" }, { v: "=SUM(A1:A1)" }, { v: "=211^2" }]).slice(1), [40001, 52345, 44521]);
  });

  it("shows a date for a date function or a date reference", () => {
    assert.deepEqual(displayed([{ v: "2025-03-04" }, { v: "=A1+30" }, { v: "=DATE(2025,1,2)" }, { v: "=C1+1" }, { v: "=EDATE(A1,1)" }]).slice(1), [
      "04/03/2025",
      "01/02/2025",
      "01/03/2025",
      "04/04/2025",
    ]);
  });

  it("keeps an explicit format, whatever the origin", () => {
    assert.deepEqual(
      displayed([
        { v: "=40000+1", f: "YYYY-MM-DD" },
        { v: "=DATE(2025,1,2)", f: "#,##0" },
      ]),
      ["2009-07-07", "45,659"],
    );
  });

  it("shows a looked-up date as its number, as Excel does without a format", () => {
    const data: SheetData["data"] = [
      [{ v: "=HLOOKUP(1,B1:B2,2,FALSE)" }, { v: 1 }],
      [{ v: "" }, { v: "2025-03-15" }],
    ];
    assert.equal(cellAt(new SpreadsheetEngine().calculate({ name: "S", data } satisfies SheetData).data, 0, 0), 45731);
  });
});

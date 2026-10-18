// Serial numbers follow the real calendar, as LibreOffice and Google Sheets do,
// not Excel's 1900 that counts a 1900-02-29 that never existed. Excel's serials
// 1–59 are therefore one day later than these, and from 61 (1900-03-01) the two
// agree. The expectations come from Date.UTC, not from the engine.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dateToSerial, serialToDate } from "../../src/engine/date-utils.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";

const MS_PER_DAY = 86_400_000;
const FIRST_SERIAL_CHECKED = -400;
const LAST_SERIAL_CHECKED = 800;
const MARCH_1_1900 = 61;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

describe("serials around 1900 on the real calendar", () => {
  it("steps exactly one real day per serial, with no 1900-02-29", () => {
    const serials = Array.from({ length: LAST_SERIAL_CHECKED - FIRST_SERIAL_CHECKED + 1 }, (_, index) => FIRST_SERIAL_CHECKED + index);
    serials.slice(1).forEach((serial) => {
      assert.equal(serialToDate(serial).getTime() - serialToDate(serial - 1).getTime(), MS_PER_DAY, `serial ${serial}`);
      assert.equal(dateToSerial(serialToDate(serial)), serial, `round trip of ${serial}`);
    });
    assert.ok(!serials.map((serial) => isoDay(serialToDate(serial))).includes("1900-02-29"));
  });

  it("places 1900-02-28 at 60 and 1900-03-01 at 61", () => {
    assert.equal(isoDay(serialToDate(59)), "1900-02-27");
    assert.equal(isoDay(serialToDate(60)), "1900-02-28");
    assert.equal(isoDay(serialToDate(MARCH_1_1900)), "1900-03-01");
  });
});

/** Each formula's value, all calculated in one row. */
const valuesOf = (formulas: string[]): unknown[] => {
  const grid = new SpreadsheetEngine().calculate({ name: "S", data: [formulas.map((formula) => ({ v: formula }))] } satisfies SheetData).data;
  return formulas.map((_, column) => cellAt(grid, 0, column));
};

describe("date functions before 1900-03-01", () => {
  it("build and read dates on the real calendar", () => {
    // Excel answers 1, 59, its phantom 60, and 61.
    assert.deepEqual(valuesOf(["=DATE(1900,1,1)", "=DATE(1900,2,28)", "=DATE(1900,2,29)", "=DATE(1900,3,1)"]), [2, 60, MARCH_1_1900, MARCH_1_1900]);
    assert.deepEqual(valuesOf(["=YEAR(60)", "=MONTH(60)", "=DAY(60)"]), [1900, 2, 28]);
  });

  it("count the days between them without a 29 February", () => {
    // Excel answers 2, 60, and 60.
    assert.deepEqual(valuesOf(["=DAYS(DATE(1900,3,1),DATE(1900,2,28))", "=DATE(1900,3,1)-DATE(1900,1,1)", "=EOMONTH(DATE(1900,2,1),0)"]), [1, 59, 60]);
  });

  it("give the real weekday", () => {
    // 1899-12-31 was a Sunday, 1900-03-01 a Thursday.
    assert.deepEqual(valuesOf(["=WEEKDAY(1)", "=WEEKDAY(61)"]), [1, 5]);
  });
});

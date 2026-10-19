// TEXT with an Excel date or time format code. TEXT used to render number codes
// only, so `TEXT(45672,"yyyy-mm")` came back "45672": a month taken out of a date
// column became a serial, and a SUMIF criterion or a heading built on it was
// silently wrong.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDatePattern, renderDatePattern } from "../../src/engine/textDateFormat.ts";
import { readBeside, seededRandom } from "./textCellRead.ts";
import { isSpreadsheetErrorValue } from "../../src/engine/spreadsheet-errors.ts";

// 2025-01-15, a Wednesday.
const JAN_15_2025 = 45672;
const SIX_PM = 0.75;

const text = (value: number, pattern: string): string | null => {
  const tokens = parseDatePattern(pattern);
  return tokens && renderDatePattern(value, tokens);
};

describe("TEXT date codes — the cases in #144", () => {
  it("renders the codes the issue lists", () => {
    const formulas = ['=TEXT(45672,"YYYY-MM-DD")', '=TEXT(45672,"yyyy-mm")', '=TEXT(45672,"mm/dd/yyyy")'];
    assert.deepEqual(readBeside("", formulas), ["2025-01-15", "2025-01", "01/15/2025"]);
  });

  it("keeps the number codes as they were", () => {
    assert.deepEqual(readBeside("", ['=TEXT(1234.5,"#,##0.00")', '=TEXT(0.25,"0%")']), ["1,234.50", "25%"]);
  });
});

describe("TEXT date codes — each part", () => {
  it("reads year, month and day at every width", () => {
    assert.equal(text(JAN_15_2025, "yy y yyyy"), "25 25 2025");
    assert.equal(text(JAN_15_2025, "m mm mmm mmmm mmmmm"), "1 01 Jan January J");
    assert.equal(text(JAN_15_2025, "d dd ddd dddd"), "15 15 Wed Wednesday");
  });

  it("reads the letters in any case", () => {
    assert.equal(text(JAN_15_2025, "YYYY-Mm-dD"), "2025-01-15");
  });

  it("reads m as minutes after an hour or before a second, and as the month elsewhere", () => {
    assert.equal(text(JAN_15_2025 + SIX_PM, "h:mm"), "18:00");
    assert.equal(text(JAN_15_2025 + 0.5 + 5 / 1440, "mm:ss"), "05:00");
    assert.equal(text(JAN_15_2025 + SIX_PM, "yyyy-mm-dd hh:mm"), "2025-01-15 18:00");
    assert.equal(text(JAN_15_2025, "mmm"), "Jan");
  });

  it("uses the 12-hour clock only with AM/PM", () => {
    assert.equal(text(JAN_15_2025 + SIX_PM, "h:mm AM/PM"), "6:00 PM");
    assert.equal(text(JAN_15_2025 + SIX_PM, "hh:mm am/pm"), "06:00 pm");
    assert.equal(text(JAN_15_2025, "h:mm AM/PM"), "12:00 AM");
    assert.equal(text(JAN_15_2025 + SIX_PM, "hh:mm:ss"), "18:00:00");
  });

  it("keeps other characters, quoted text and escaped letters as written", () => {
    assert.equal(text(JAN_15_2025, "yyyy年m月d日"), "2025年1月15日");
    assert.equal(text(JAN_15_2025, '"day "d'), "day 15");
    assert.equal(text(JAN_15_2025, "\\d d"), "d 15");
  });
});

describe("TEXT date codes — what is not a date code", () => {
  it("leaves a code with no date part to the number formats", () => {
    ["0.00", "#,##0", "$#,##0.00", "0%", "General", '"yyyy"'].forEach((pattern) => assert.equal(parseDatePattern(pattern), null, pattern));
  });

  it("declines elapsed time and locale codes rather than guessing", () => {
    ["[h]:mm", "[$-409]yyyy-mm-dd"].forEach((pattern) => assert.equal(parseDatePattern(pattern), null, pattern));
  });

  it("answers #VALUE! for a negative serial, as Excel does", () => {
    const [result] = readBeside("", ['=TEXT(-1,"yyyy")']);
    assert.ok(isSpreadsheetErrorValue(result) && result.code === "#VALUE!", String(result));
  });
});

describe("TEXT — a text value", () => {
  it("reads a date kept as text as that date", () => {
    const formulas = ['=TEXT(A1,"yyyy-mm")', '=TEXT(A1,"mmm d")'];
    assert.deepEqual(readBeside("2025-01-15", formulas), ["2025-01", "Jan 15"]);
    assert.deepEqual(readBeside("2025年1月", formulas), ["2025-01", "Jan 1"]);
  });

  it("reads a number kept as text as that number", () => {
    assert.deepEqual(readBeside("", ['=TEXT("1,234","#,##0.00")']), ["1,234.00"]);
  });

  it("passes other text through unchanged", () => {
    assert.deepEqual(readBeside("Tokyo, Japan", ['=TEXT(A1,"yyyy")', '=TEXT(A1,"0.00")']), ["Tokyo, Japan", "Tokyo, Japan"]);
  });
});

describe("TEXT date codes — generated dates", () => {
  // Past Excel's fictitious 1900-02-29 (serial 60), a serial counts days from 1899-12-30.
  const FIRST_REAL_SERIAL = 61;
  const SERIAL_SPAN = 80000;
  const MS_PER_DAY = 86_400_000;
  const EPOCH_MS = Date.UTC(1899, 11, 30);
  const SEED = 144;
  const GENERATED_COUNT = 500;

  it("writes the same calendar date as JavaScript's own date arithmetic", () => {
    const random = seededRandom(SEED);
    const serials = Array.from({ length: GENERATED_COUNT }, () => FIRST_REAL_SERIAL + Math.floor(random() * SERIAL_SPAN));
    const wrong = serials.filter((serial) => text(serial, "yyyy-mm-dd") !== new Date(EPOCH_MS + serial * MS_PER_DAY).toISOString().slice(0, 10));
    assert.deepEqual(wrong, [], `seed ${SEED}`);
  });
});

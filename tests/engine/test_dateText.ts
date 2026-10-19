// Date-like text (#142). A cell holding `2025-01` stays the text it was written as — LEFT, RIGHT
// and a "2025-*" criteria keep working on it — and the functions that take a date read it as that
// month's first day, as Excel does with a date stored as text. Generated: DATE_TEXT_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSheet, type SheetData } from "../../src/engine/index.ts";
import { dateSerialFromText } from "../../src/engine/dateText.ts";
import { serialFromParts } from "../../src/engine/date-parser.ts";
import { parseNonStringInput } from "../../src/engine/cellBuilder.ts";
import { MONTH_NAMES_FULL, MONTH_NAMES_SHORT } from "../../src/engine/date-utils.ts";

const read = (text: string, formulas: string[]): unknown[] => {
  const sheet: SheetData = { name: "S", data: [[text, ...formulas].map((v) => ({ v }))] };
  return calculateSheet(sheet, [sheet], { skipFormatting: true }).data[0]?.slice(1) ?? [];
};

describe("a cell holding a month or a Japanese date", () => {
  const cells: [string, number, number, number][] = [
    ["2025-01", 2025, 1, 1],
    ["2025/3", 2025, 3, 1],
    ["Jan 2025", 2025, 1, 1],
    ["September 2025", 2025, 9, 1],
    ["2025年1月", 2025, 1, 1],
    ["2025年1月15日", 2025, 1, 15],
  ];
  for (const [text, year, month, day] of cells) {
    it(`keeps ${text} as text and reads it as a date in a date function`, () => {
      assert.deepEqual(read(text, ["=A1", "=YEAR(A1)", "=MONTH(A1)", "=DAY(A1)"]), [text, year, month, day]);
    });
  }

  it("is a date to the calendar functions too", () => {
    assert.deepEqual(read("2025-01", ["=EOMONTH(A1,0)", "=WEEKDAY(A1)", '=DATEDIF(A1,"2025-03","M")', "=EDATE(A1,1)"]), [
      serialFromParts(2025, 1, 31),
      4,
      2,
      serialFromParts(2025, 2, 1),
    ]);
  });

  it("is #VALUE! where a calendar function takes a count or a code, not a date", () => {
    assert.deepEqual(
      read("2025-01", ["=WEEKDAY(45000,A1)", "=EDATE(45000,A1)", "=EOMONTH(45000,A1)", "=WORKDAY(45000,A1)"]).map(String),
      Array(4).fill("#VALUE!"),
    );
  });

  it("is a date in every date position of a calendar function", () => {
    assert.deepEqual(read("2025-01", ["=DAYS(A1,45658)", "=NETWORKDAYS(A1,45660)", '=WORKDAY(45657,1,"2025-01")']), [0, 3, 45659]);
  });

  // Guards, not regressions: these held before and must keep holding.
  it("is still text to text functions and to a wildcard criteria", () => {
    const sheet: SheetData = {
      name: "S",
      data: [
        [{ v: "2023-01" }, { v: 10 }],
        [{ v: "2023-02" }, { v: 20 }],
        [{ v: "2024-01" }, { v: 40 }],
        [{ v: "=RIGHT(A1,2)" }, { v: '=SUMIF(A1:A3,"2023-*",B1:B3)' }],
      ],
    };
    assert.deepEqual(calculateSheet(sheet, [sheet], { skipFormatting: true }).data[3], ["01", 30]);
  });

  it("is not a date when the month or day does not exist", () => {
    for (const text of ["2025-13", "2025-00", "Foo 2025", "2025年2月30日", "1/2", "12abc"]) assert.equal(dateSerialFromText(text), null, text);
  });
});

describe("a date typed in the cell editor", () => {
  it("is kept as typed, not turned into a subtraction or a division", () => {
    for (const text of ["2025-01-15", "2025-01", "1/15/2025", "15/01/2025", "2025年1月15日"]) assert.equal(parseNonStringInput(text), text, text);
  });

  it("still makes a formula of arithmetic that is not a date", () => {
    assert.deepEqual(["1/2", "10-3", "2025-13"].map(parseNonStringInput), ["=1/2", "=10-3", "=2025-13"]);
  });
});

const SEED = Number(process.env.DATE_TEXT_SEED ?? Date.now() % 1_000_000);
describe(`every month, written each way (DATE_TEXT_SEED=${SEED})`, () => {
  const random = (() => {
    let state = SEED;
    return (): number => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  })();
  const ROUNDS = 500;
  const MIN_YEAR = 1900;
  const YEARS = 200;

  it("reads back the first day of that month", () => {
    const wrong = Array.from({ length: ROUNDS }, () => {
      const year = MIN_YEAR + Math.floor(random() * YEARS);
      const month = 1 + Math.floor(random() * 12);
      const forms = [
        `${year}-${String(month).padStart(2, "0")}`,
        `${year}/${month}`,
        `${MONTH_NAMES_SHORT[month - 1]} ${year}`,
        `${MONTH_NAMES_FULL[month - 1]} ${year}`,
        `${year}年${month}月`,
      ];
      return forms.filter((text) => dateSerialFromText(text) !== serialFromParts(year, month, 1));
    }).flat();
    assert.deepEqual(wrong.slice(0, 5), [], `seed ${SEED}`);
  });
});

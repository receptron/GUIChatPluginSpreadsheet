// The expected serials are the worked examples in Microsoft's documentation for
// each function, so the rules are checked against Excel rather than against this
// code. 39493 is 2008-02-14, a Thursday.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addMonths, addWorkdays, countWorkdays, daysBetween, endOfMonth, LAST_SERIAL, weekdayOf } from "../../src/engine/date-calendar.ts";
import { dateToSerial } from "../../src/engine/date-utils.ts";
import { NUM_ERROR } from "../../src/engine/spreadsheet-errors.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";

const serial = (year: number, month: number, day: number): number => dateToSerial(new Date(Date.UTC(year, month - 1, day)));

describe("weekdayOf", () => {
  const thursday = serial(2008, 2, 14);

  it("WEEKDAY documentation examples", () => {
    assert.equal(weekdayOf(thursday), 5);
    assert.equal(weekdayOf(thursday, 2), 4);
    assert.equal(weekdayOf(thursday, 3), 3);
  });

  it("counts from the day each return type starts on", () => {
    assert.equal(weekdayOf(thursday, 11), 4);
    assert.equal(weekdayOf(thursday, 14), 1);
    assert.equal(weekdayOf(thursday, 17), 5);
  });

  it("ignores the time of day", () => {
    assert.equal(weekdayOf(thursday + 0.75), 5);
  });

  it("answers #NUM! for an unknown return type", () => {
    [0, 4, 9, 18].forEach((type) => assert.equal(weekdayOf(thursday, type), NUM_ERROR));
  });
});

describe("daysBetween", () => {
  it("DAYS documentation example, and a negative span", () => {
    assert.equal(daysBetween(serial(2021, 3, 15), serial(2021, 2, 1)), 42);
    assert.equal(daysBetween(serial(2021, 2, 1), serial(2021, 3, 15)), -42);
  });

  it("drops the time of day before subtracting", () => {
    assert.equal(daysBetween(serial(2021, 1, 2) + 0.1, serial(2021, 1, 1) + 0.9), 1);
  });
});

describe("addMonths and endOfMonth", () => {
  it("EDATE documentation examples", () => {
    assert.equal(addMonths(serial(2011, 1, 15), 1), serial(2011, 2, 15));
    assert.equal(addMonths(serial(2011, 1, 15), -1), serial(2010, 12, 15));
    assert.equal(addMonths(serial(2011, 1, 15), 2), serial(2011, 3, 15));
  });

  it("moves a day the target month lacks back to its last day", () => {
    assert.equal(addMonths(serial(2011, 1, 31), 1), serial(2011, 2, 28));
    assert.equal(addMonths(serial(2012, 1, 31), 1), serial(2012, 2, 29));
    assert.equal(addMonths(serial(2011, 3, 31), -1), serial(2011, 2, 28));
  });

  it("truncates fractional months", () => {
    assert.equal(addMonths(serial(2011, 1, 15), 1.9), serial(2011, 2, 15));
  });

  it("EOMONTH documentation examples", () => {
    assert.equal(endOfMonth(serial(2011, 1, 1), 1), serial(2011, 2, 28));
    assert.equal(endOfMonth(serial(2011, 1, 1), -3), serial(2010, 10, 31));
    assert.equal(endOfMonth(serial(2011, 12, 15), 0), serial(2011, 12, 31));
  });
});

describe("addWorkdays and countWorkdays", () => {
  const holidays = [serial(2008, 11, 26), serial(2008, 12, 4), serial(2009, 1, 21)];

  it("WORKDAY documentation examples", () => {
    assert.equal(addWorkdays(serial(2008, 10, 1), 151), serial(2009, 4, 30));
    assert.equal(addWorkdays(serial(2008, 10, 1), 151, holidays), serial(2009, 5, 5));
  });

  it("goes back for negative days, and stays put for zero", () => {
    assert.equal(addWorkdays(serial(2026, 10, 19), -1), serial(2026, 10, 16));
    assert.equal(addWorkdays(serial(2026, 10, 18), 0), serial(2026, 10, 18));
  });

  it("NETWORKDAYS documentation examples", () => {
    const start = serial(2012, 10, 1);
    const end = serial(2013, 3, 1);
    assert.equal(countWorkdays(start, end), 110);
    assert.equal(countWorkdays(start, end, [serial(2012, 11, 22)]), 109);
    assert.equal(countWorkdays(start, end, [serial(2012, 11, 22), serial(2012, 12, 4), serial(2013, 1, 21)]), 107);
  });

  it("counts both ends, and is negative when the end comes first", () => {
    assert.equal(countWorkdays(serial(2026, 10, 19), serial(2026, 10, 19)), 1);
    assert.equal(countWorkdays(serial(2026, 10, 18), serial(2026, 10, 18)), 0);
    assert.equal(countWorkdays(serial(2026, 10, 23), serial(2026, 10, 19)), -5);
  });
});

// A1:D1 = 1..4, A2:C2 = three holidays, the formula in E1.
const evaluateInSheet = (formula: string): unknown => {
  const sheet: SheetData = {
    name: "S",
    data: [
      [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: formula }],
      [{ v: "=DATE(2008,11,26)" }, { v: "=DATE(2008,12,4)" }, { v: "=DATE(2009,1,21)" }],
    ],
  };
  return cellAt(new SpreadsheetEngine().calculate(sheet).data, 0, 4);
};

describe("edges of the calendar rules", () => {
  it("covers every WEEKDAY return type on a Thursday", () => {
    const thursday = serial(2008, 2, 14);
    const expected: Record<number, number> = { 1: 5, 2: 4, 3: 3, 11: 4, 12: 3, 13: 2, 14: 1, 15: 7, 16: 6, 17: 5 };
    Object.entries(expected).forEach(([type, day]) => assert.equal(weekdayOf(thursday, Number(type)), day, `type ${type}`));
  });

  it("drops the time of day before deciding NETWORKDAYS' order", () => {
    const friday = serial(2026, 10, 23);
    assert.equal(countWorkdays(friday + 0.9, friday + 0.1), 1);
  });

  it("counts a holiday once, and not at all on a weekend or outside the span", () => {
    const monday = serial(2026, 10, 19);
    const saturday = serial(2026, 10, 24);
    assert.equal(countWorkdays(monday, monday + 6, [monday, monday, saturday, monday + 30]), 4);
  });

  it("agrees with a day-by-day count over generated spans", () => {
    const isWeekday = (day: number): boolean => weekdayOf(day, 2) !== NUM_ERROR && Number(weekdayOf(day, 2)) <= 5;
    const seed = { value: 11 };
    const next = (): number => (seed.value = (seed.value * 16807) % 2147483647) / 2147483647;
    Array.from({ length: 300 }, (): [number, number] => [Math.floor(40000 + next() * 4000), Math.floor(next() * 400)]).forEach(([start, length]) => {
      const naive = Array.from({ length: length + 1 }, (_, offset) => start + offset).filter(isWeekday).length;
      assert.equal(countWorkdays(start, start + length), naive, `${start}+${length}`);
    });
  });

  it("answers #NUM! outside Excel's dates, quickly, for huge spans", () => {
    assert.equal(countWorkdays(1, 1_000_000_000), NUM_ERROR);
    assert.equal(addWorkdays(serial(2026, 1, 1), 1_000_000_000), NUM_ERROR);
    assert.equal(addMonths(LAST_SERIAL, 1), NUM_ERROR);
    assert.equal(daysBetween(-1, 1), NUM_ERROR);
    assert.equal(typeof countWorkdays(0, LAST_SERIAL), "number");
  });
});

describe("through the engine", () => {
  it("reads holidays from a range or a single date", () => {
    assert.equal(evaluateInSheet("=WORKDAY(DATE(2008,10,1),151,A2:C2)"), "05/05/2009");
    assert.equal(evaluateInSheet("=NETWORKDAYS(DATE(2012,10,1),DATE(2013,3,1),DATE(2012,11,22))"), 109);
  });

  it("calls the names current Excel writes, in any case", () => {
    assert.equal(evaluateInSheet("=PERCENTILE.INC(A1:D1,0.5)"), 2.5);
    assert.equal(evaluateInSheet("=1+QUARTILE.INC(A1:D1,1)"), 2.75);
    assert.equal(evaluateInSheet("=stdev.p(A1:D1)"), Math.sqrt(1.25));
    assert.equal(evaluateInSheet("=RANK.EQ(3,A1:D1)"), 2);
  });

  it("reads every alias as its function", () => {
    assert.equal(evaluateInSheet("=STDEV.S(A1:D1)"), evaluateInSheet("=STDEV(A1:D1)"));
    assert.equal(evaluateInSheet("=VAR.S(A1:D1)"), evaluateInSheet("=VAR(A1:D1)"));
    assert.equal(evaluateInSheet("=VAR.P(A1:D1)"), 1.25);
  });

  it("answers #VALUE! for text that is not a date, and passes an error through", () => {
    assert.equal(evaluateInSheet('=DAYS("not a date",1)'), "#VALUE!");
    assert.equal(evaluateInSheet("=WEEKDAY(1/0)"), "#DIV/0!");
    assert.equal(evaluateInSheet("=NETWORKDAYS(DATE(2026,1,1),DATE(2026,1,31),1/0)"), "#DIV/0!");
  });

  it("reads a date written as text", () => {
    assert.equal(evaluateInSheet('=DAYS("2021-03-15","2021-02-01")'), 42);
  });

  it("answers #NAME? for an unknown dotted name", () => {
    assert.equal(evaluateInSheet("=FOO.BAR(1)"), "#NAME?");
  });
});

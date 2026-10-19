// A workbook's own functions (#114): what a definition may be, what a call sees and returns, and
// what the sandbox keeps out. QuickJS really runs here — the limits are only worth what a real
// run shows.

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { calculateWith, loadCustomFunctions, asCellValue, type CustomFunctionSet } from "../../src/engine/customFunctions.ts";
import { checkedSpecs, problemWith, specsOf, type CustomFunctionSpec } from "../../src/engine/customFunctionSpecs.ts";
import { functionRegistry } from "../../src/engine/registry.ts";
import { NUM_ERROR, VALUE_ERROR } from "../../src/engine/spreadsheet-errors.ts";
import { cellAt } from "./cellAccess.ts";

const spec = (name: string, params: string[], body: string): CustomFunctionSpec => ({ name, params, body });
const isBuiltIn = (name: string) => functionRegistry.isBuiltIn(name);

describe("specsOf", () => {
  it("keeps entries shaped like a definition and skips the rest", () => {
    const functions = [
      spec("A.B", ["x"], "return x;"),
      { name: "NO.BODY", params: [] },
      { name: 1, params: [], body: "" },
      "text",
      null,
      { name: "D", params: ["x", 2], body: "" },
    ];
    assert.deepEqual(specsOf(functions), [spec("A.B", ["x"], "return x;")]);
  });

  it("is empty for a sheet without functions", () => {
    assert.deepEqual(specsOf(undefined), []);
    assert.deepEqual(specsOf({}), []);
  });
});

describe("problemWith", () => {
  it("accepts letters, digits and dot-joined parts", () => {
    assert.equal(problemWith(spec("MOVING.AVG", ["values", "n"], ""), isBuiltIn), null);
    assert.equal(problemWith(spec("score2", ["x"], ""), isBuiltIn), null);
  });

  it("refuses a name a formula cannot call, or one the engine already has", () => {
    assert.match(problemWith(spec("MOVING_AVG", [], ""), isBuiltIn) ?? "", /letters and digits/);
    assert.match(problemWith(spec("2X", [], ""), isBuiltIn) ?? "", /letters and digits/);
    assert.match(problemWith(spec("sum", [], ""), isBuiltIn) ?? "", /built-in/);
  });

  it("refuses parameters that are not names, repeat, or are too many", () => {
    assert.match(problemWith(spec("F", ["a-b"], ""), isBuiltIn) ?? "", /not a parameter name/);
    assert.match(problemWith(spec("F", ["a", "a"], ""), isBuiltIn) ?? "", /named twice/);
    assert.match(
      problemWith(
        spec(
          "F",
          Array.from({ length: 33 }, (_, i) => `p${i}`),
          "",
        ),
        isBuiltIn,
      ) ?? "",
      /at most/,
    );
  });
});

describe("checkedSpecs", () => {
  it("keeps the first of a name defined twice and reports the second", () => {
    const { usable, problems } = checkedSpecs([spec("F", [], "return 1;"), spec("f", [], "return 2;")], isBuiltIn);
    assert.equal(usable.get("F")?.body, "return 1;");
    assert.deepEqual(problems, [{ name: "f", reason: "F is defined twice" }]);
  });
});

describe("asCellValue", () => {
  it("passes a finite number, text and a logical; anything else is an error", () => {
    assert.equal(asCellValue(3), 3);
    assert.equal(asCellValue("a"), "a");
    assert.equal(asCellValue(false), false);
    assert.equal(asCellValue(Number.NaN), NUM_ERROR);
    assert.equal(asCellValue(Infinity), NUM_ERROR);
    assert.equal(asCellValue({}), VALUE_ERROR);
    assert.equal(asCellValue(null), VALUE_ERROR);
    assert.equal(asCellValue(undefined), VALUE_ERROR);
  });
});

const FUNCTIONS: CustomFunctionSpec[] = [
  spec(
    "MOVING.AVG",
    ["values", "n"],
    "const xs = values.flat().filter((v) => typeof v === 'number'); const tail = xs.slice(-n); return tail.reduce((a, b) => a + b, 0) / tail.length;",
  ),
  spec("SHAPE", ["values"], "return values.length + 'x' + values[0].length + ':' + JSON.stringify(values);"),
  spec("TWICE", ["x"], "return x * 2;"),
  spec("SHAPE.OF", ["x"], "return typeof x + ':' + JSON.stringify(x);"),
  spec("SPIN", [], "while (true) {}"),
  spec("THROWS", [], "throw new Error('nope');"),
  spec("OBJECT", [], "return { a: 1 };"),
  spec("NOT.NUMBER", [], "return 0 / 0;"),
  spec("REACH", [], "return [typeof fetch, typeof require, typeof process, typeof window, typeof setTimeout, typeof XMLHttpRequest].join(',');"),
  spec("SET.GLOBAL", [], "globalThis.leak = 1; return 1;"),
  spec("READ.GLOBAL", [], "return typeof globalThis.leak;"),
  spec("HOG", [], "return new Array(5000000).fill(1).length;"),
  spec("TO.JSON", [], "return { toJSON() { return 7; } };"),
  spec("SLOW.GETTER", [], "return { get x() { while (true) {} } };"),
  spec("SLOW.THROW", [], "throw { get message() { while (true) {} } };"),
];

const sheetWith = (rows: SheetData["data"]): SheetData & { functions: CustomFunctionSpec[] } => ({ name: "Data", functions: FUNCTIONS, data: rows });

describe("calling a workbook's functions", () => {
  let set: CustomFunctionSet;
  const calculate = (rows: SheetData["data"], others: SheetData[] = []) => {
    const sheet = sheetWith(rows);
    return calculateWith(set, () => new SpreadsheetEngine().calculate(sheet, [sheet, ...others])).data;
  };
  after(() => set?.dispose());

  it("loads them, with no problems", async () => {
    set = await loadCustomFunctions([sheetWith([])]);
    assert.deepEqual(set.problems, []);
  });

  it("hands a single cell as its value, not as a one-cell range", () => {
    const rows: SheetData["data"] = [[{ v: 3 }, { v: "=SHAPE.OF(A1)" }, { v: "=SHAPE.OF(A2)" }]];
    const out = calculate(rows);
    assert.equal(cellAt(out, 0, 1), "number:3");
    assert.equal(cellAt(out, 0, 2), "object:null");
  });

  it("hands a whole column or row as the range it covers in its sheet's data", () => {
    const other: SheetData = {
      name: "Other",
      data: [
        [{ v: "x" }, { v: 5 }],
        [{ v: "y" }, { v: 6 }, { v: 7 }],
      ],
    };
    const rows: SheetData["data"] = [[{ v: 1 }, { v: "=SHAPE(A:A)" }, { v: "=SHAPE(Other!B:B)" }, { v: "=SHAPE(Other!2:2)" }], [{ v: 2 }]];
    const out = calculate(rows, [other]);
    assert.deepEqual(
      [1, 2, 3].map((col) => cellAt(out, 0, col)),
      ["2x1:[[1],[2]]", "2x1:[[5],[6]]", '1x3:[["y",6,7]]'],
    );
  });

  it("hands a range as rows of cells, a blank as null", () => {
    const rows: SheetData["data"] = [
      [{ v: 1 }, { v: "a" }, { v: "=SHAPE(A1:B2)" }],
      [{ v: "" }, { v: 4 }],
    ];
    assert.equal(cellAt(calculate(rows), 0, 2), '2x2:[[1,"a"],[null,4]]');
  });

  it("computes from the cells, and recalculates as a formula does", () => {
    const rows: SheetData["data"] = [[{ v: 1 }, { v: "=MOVING.AVG(A1:A4, 2)" }], [{ v: 2 }, { v: "=TWICE(B1)+1" }], [{ v: "" }], [{ v: 6 }]];
    const out = calculate(rows);
    assert.equal(cellAt(out, 0, 1), 4);
    assert.equal(cellAt(out, 1, 1), 9);
  });

  it("reads a range on another sheet", () => {
    const other: SheetData = { name: "Other", data: [[{ v: 10 }], [{ v: 20 }]] };
    assert.equal(cellAt(calculate([[{ v: "=MOVING.AVG(Other!A1:A2, 2)" }]], [other]), 0, 0), 15);
  });

  it("passes on an error in an argument instead of calling", () => {
    assert.equal(cellAt(calculate([[{ v: "=1/0" }, { v: "=TWICE(A1)" }]]), 0, 1), "#DIV/0!");
  });

  it("answers #NUM! for a call that runs too long, and #VALUE! for one that throws or returns no value", () => {
    const out = calculate([[{ v: "=SPIN()" }, { v: "=THROWS()" }, { v: "=OBJECT()" }, { v: "=NOT.NUMBER()" }]]);
    assert.deepEqual(
      [0, 1, 2, 3].map((col) => cellAt(out, 0, col)),
      ["#NUM!", "#VALUE!", "#VALUE!", "#NUM!"],
    );
  });

  // Five million numbers is far past the cap and quick to ask for: without the cap it answers 5000000.
  // Reading what a function returned or threw must not run its code outside the deadline.
  it("does not serialize a returned object, nor wait on a thrown one's getters", () => {
    const started = Date.now();
    const out = calculate([[{ v: "=TO.JSON()" }, { v: "=SLOW.GETTER()" }, { v: "=SLOW.THROW()" }]]);
    assert.deepEqual(
      [0, 1, 2].map((col) => cellAt(out, 0, col)),
      ["#VALUE!", "#VALUE!", "#VALUE!"],
    );
    assert.ok(Date.now() - started < 1000, "nothing ran past the call's deadline");
  });

  it("stops a function that asks for more memory than the cap", () => {
    assert.equal(cellAt(calculate([[{ v: "=HOG()" }]]), 0, 0), "#VALUE!");
  });

  it("gives a function no way out: no fetch, require, process, window, timers or XHR", () => {
    assert.equal(cellAt(calculate([[{ v: "=REACH()" }]]), 0, 0), "undefined,undefined,undefined,undefined,undefined,undefined");
  });

  it("keeps each function's globals its own", () => {
    const out = calculate([[{ v: "=SET.GLOBAL()" }, { v: "=READ.GLOBAL()" }]]);
    assert.equal(cellAt(out, 0, 1), "undefined");
  });

  it("checks the number of arguments", () => {
    assert.match(String(cellAt(calculate([[{ v: "=TWICE(1, 2)" }]]), 0, 0)), /^#/);
  });
});

describe("the functions are the workbook's alone", () => {
  it("are unknown outside calculateWith, also after a calculation that threw", async () => {
    const set = await loadCustomFunctions([sheetWith([])]);
    const sheet = sheetWith([[{ v: "=TWICE(2)" }]]);
    assert.equal(cellAt(new SpreadsheetEngine().calculate(sheet).data, 0, 0), "#NAME?");
    assert.throws(() =>
      calculateWith(set, () => {
        throw new Error("boom");
      }),
    );
    assert.equal(functionRegistry.hasFunction("TWICE"), false);
    set.dispose();
  });

  it("do not mix between two workbooks defining the same name", async () => {
    const one = await loadCustomFunctions([{ functions: [spec("PICK", [], "return 1;")] }]);
    const two = await loadCustomFunctions([{ functions: [spec("PICK", [], "return 2;")] }]);
    const sheet: SheetData = { name: "S", data: [[{ v: "=PICK()" }]] };
    assert.equal(cellAt(calculateWith(one, () => new SpreadsheetEngine().calculate(sheet)).data, 0, 0), 1);
    assert.equal(cellAt(calculateWith(two, () => new SpreadsheetEngine().calculate(sheet)).data, 0, 0), 2);
    one.dispose();
    two.dispose();
  });

  it("never shadows a built-in, even handed one directly", () => {
    const impostor = { name: "SUM", handler: () => -1 };
    const sheet: SheetData = { name: "S", data: [[{ v: 2 }, { v: "=SUM(A1)" }]] };
    const out = functionRegistry.withOverlay(new Map([["SUM", impostor]]), () => new SpreadsheetEngine().calculate(sheet));
    assert.equal(cellAt(out.data, 0, 1), 2);
  });

  it("cannot replace a built-in function", async () => {
    const set = await loadCustomFunctions([{ functions: [spec("SUM", ["x"], "return -1;")] }]);
    assert.deepEqual(set.problems, [{ name: "SUM", reason: "SUM is a built-in function" }]);
    const sheet: SheetData = { name: "S", data: [[{ v: 2 }, { v: "=SUM(A1)" }]] };
    assert.equal(cellAt(calculateWith(set, () => new SpreadsheetEngine().calculate(sheet)).data, 0, 1), 2);
    set.dispose();
  });

  it("reports a body that does not compile, and keeps the others", async () => {
    const set = await loadCustomFunctions([{ functions: [spec("BROKEN", [], "return ("), spec("FINE", [], "return 1;")] }]);
    assert.equal(set.problems.length, 1);
    assert.match(set.problems[0]?.reason ?? "", /does not compile/);
    assert.equal(set.definitions.has("FINE"), true);
    set.dispose();
  });

  // A body can close its Function early and run code while it loads; that code is held to a deadline.
  it("stops code a body runs while it loads, and keeps the other functions", async () => {
    const set = await loadCustomFunctions([{ functions: [spec("ESCAPE", [], "}); while (true) {} (function () {"), spec("FINE", [], "return 1;")] }]);
    assert.equal(set.problems.length, 1);
    assert.match(set.problems[0]?.reason ?? "", /does not compile/);
    assert.equal(set.definitions.has("FINE"), true);
    set.dispose();
  });

  it("does not load QuickJS for a workbook without functions", async () => {
    const set = await loadCustomFunctions([{ name: "S" }]);
    assert.equal(set.definitions.size, 0);
  });
});

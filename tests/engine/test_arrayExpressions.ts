// Array constants, expressions calculated element by element, and SUMPRODUCT: which operands are
// arrays, how operands of different sizes line up, and what each element answers. Generated cases
// print their seed; rerun one with ARRAY_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import { alignedIndex, arrayOperands, combinedShape, parseArrayConstant } from "../../src/engine/arrayExpression.ts";
import { CALL_NAMES, answersTable } from "../../src/engine/registry.ts";
import { NA_ERROR, spreadsheetError } from "../../src/engine/spreadsheet-errors.ts";
import { seededRandom } from "./seededRandom.ts";

const operandTexts = (formula: string): string[] => arrayOperands(formula, CALL_NAMES).map(({ kind, text }) => `${kind}:${text}`);

/** The sheet `rows` calculates to; a string starting with "=" is a formula. */
function calculated(rows: CellValue[][], extraSheets: { name: string; data: CellValue[][] }[] = []): CellValue[][] {
  const toSheet = (name: string, data: CellValue[][]) => ({ name, data: data.map((row) => row.map((v) => ({ v }))) });
  const [first] = new SpreadsheetEngine().calculateWorkbook([toSheet("S", rows), ...extraSheets.map(({ name, data }) => toSheet(name, data))]);
  return first?.data ?? [];
}

/** The table `formula`, written in column D beside A1:C3 below, spills (the cells it fills). */
function answer(formula: string): CellValue[][] {
  const rows: CellValue[][] = [
    [1, 10, "", formula],
    [2, 20, "x", ""],
    [3, 30, "=1/0", ""],
  ];
  return calculated(rows)
    .map((row) => row.slice(3))
    .filter((row) => row.some((cell) => cell !== ""));
}

describe("which operands are arrays", () => {
  it("finds ranges, array constants and calls that answer a table, outside every call's arguments", () => {
    assert.deepEqual(operandTexts("A1:A3*2"), ["range:A1:A3"]);
    assert.deepEqual(operandTexts("$A$1:B2+Data!C1:C2-'My Sheet'!A1:A2"), ["range:$A$1:B2", "range:Data!C1:C2", "range:'My Sheet'!A1:A2"]);
    assert.deepEqual(operandTexts("A:A+1:2"), ["range:A:A", "range:1:2"]);
    assert.deepEqual(operandTexts('{1,"a;b"}&(SORT(A1:A3)+1)'), ['constant:{1,"a;b"}', "call:SORT(A1:A3)"]);
    assert.deepEqual(operandTexts("a1:a3*2"), ["range:a1:a3"]);
    assert.deepEqual(operandTexts(`LEN(")")+A1:A2`), ["range:A1:A2"]);
    assert.deepEqual(operandTexts(`LEN(')')+A1:A2`), ["range:A1:A2"]);
    assert.deepEqual(operandTexts(`{"}",1}*A1:A2`), [`constant:{"}",1}`, "range:A1:A2"]);
  });

  it("leaves what a call reads, text, single cells and names glued to a range alone", () => {
    [
      "SUM(A1:A3)*2",
      'COUNTIF(A1:A5,">2")+1',
      '"A1:A3"&"{1}"',
      "'it''s'&A1",
      "A1+B2",
      "LOG10(100)",
      "UNKNOWNFN(A1:A3)+1",
      "SUM({1,2})",
      "A1:B",
      "A1:B2C",
      "A1:B2(1)",
      "A1:B2.5",
      "'A1:A3'&B1",
    ].forEach((formula) => assert.deepEqual(operandTexts(formula), [], formula));
  });

  it("calls a formula a table when it answers one and is not a reference", () => {
    ["A1:A3*2", "{1,2}", "SORT(A1:A3)", "(A1:A3)", "-A1:A3"].forEach((text) => assert.equal(answersTable(text), true, text));
    ["A1:A3", "Data!A1:B2", "A1", "SUM(A1:A3)", "1+2", '"{1,2}"'].forEach((text) => assert.equal(answersTable(text), false, text));
  });
});

describe("array constants", () => {
  it("reads rows split by ; and columns split by ,", () => {
    assert.deepEqual(parseArrayConstant("{1,2,3}"), [[1, 2, 3]]);
    assert.deepEqual(parseArrayConstant("{1;2}"), [[1], [2]]);
    assert.deepEqual(parseArrayConstant('{ -1.5 , "a,b;c" ; TRUE , #N/A }'), [
      [-1.5, "a,b;c"],
      [true, NA_ERROR],
    ]);
    assert.deepEqual(parseArrayConstant("{1e3,false}"), [[1000, false]]);
  });

  it("refuses anything that is not a constant, and rows of different lengths", () => {
    ["{1,A1}", "{1,SUM(1)}", "{1,}", "{}", "{1,2;3}", "{1+1}", "{{1}}", "1,2", '{"open}'].forEach((text) => assert.equal(parseArrayConstant(text), null, text));
  });

  it("is a table in a formula, and an argument read as a range reads it", () => {
    assert.deepEqual(answer("={1,2;3,4}"), [
      [1, 2],
      [3, 4],
    ]);
    assert.deepEqual(answer("=SUM({1,2,3})"), [[6]]);
    assert.deepEqual(answer('=VLOOKUP(2,{1,"one";2,"two"},2,FALSE)'), [["two"]]);
    assert.deepEqual(answer("={1,A1}"), [["#ERROR!"]]);
  });
});

describe("expressions over arrays", () => {
  it("calculates each element as the formula over that element's cells", () => {
    assert.deepEqual(answer("=A1:A3*B1:B3"), [[10], [40], [90]]);
    assert.deepEqual(answer("=A1:A3>1"), [[false], [true], [true]]);
    assert.deepEqual(answer('=A1:A3&"!"'), [["1!"], ["2!"], ["3!"]]);
    // Negation binds before ^, as in Excel, where =-1^2 is 1.
    assert.deepEqual(answer("=-(A1:A3)^2"), [[1], [4], [9]]);
    assert.deepEqual(answer("=SORT(A1:A3,1,-1)*{1;10;100}"), [[3], [20], [100]]);
    assert.deepEqual(answer("=SUM(A1:A3)+A1:A2"), [[7], [8]]);
    assert.deepEqual(answer("=B3:A1*1"), [
      [1, 10],
      [2, 20],
      [3, 30],
    ]);
  });

  it("reads each cell as a reference to it does: a blank as 0 in arithmetic and empty text in a join, an error cell as its error", () => {
    assert.deepEqual(answer("=C1:C1+1"), [[1]]);
    assert.deepEqual(answer('=C1:C2&"-"'), [["-"], ["x-"]]);
    assert.deepEqual(answer("=C1:C3*1"), [[0], ["#VALUE!"], ["#DIV/0!"]]);
  });

  it("keeps an element's error to that element", () => {
    assert.deepEqual(answer("=A1:A3/{1;0;2}"), [[1], ["#DIV/0!"], [1.5]]);
    assert.deepEqual(answer("={1,#N/A,3}*2"), [[2, "#N/A", 6]]);
  });

  it("repeats a single row or column, and is #N/A past the end of a shorter operand", () => {
    assert.deepEqual(answer("={1,2,3}+{10;20}"), [
      [11, 12, 13],
      [21, 22, 23],
    ]);
    assert.deepEqual(answer("={1,2,3}+{1,2}"), [[2, 4, "#N/A"]]);
    assert.deepEqual(answer("=A1:A3+{1;2}"), [[2], [4], ["#N/A"]]);
    assert.deepEqual(answer("={5}*A1:A2"), [[5], [10]]);
  });

  it("reads a range on another sheet, and is read by other formulas wherever they sit", () => {
    const data = [
      [1, 2],
      [3, 4],
    ];
    const sheet = calculated(
      [
        ["=SUM(A2:B3)", "=B3"],
        ["=Data!A1:B2*10", ""],
        ["", ""],
      ],
      [{ name: "Data", data }],
    );
    assert.deepEqual(sheet, [
      [100, 40],
      [10, 20],
      [30, 40],
    ]);
  });

  it("has its cells calculated before a formula earlier in the sheet reads one of them", () => {
    assert.deepEqual(calculated([["=B2"], ["={1,2}*10", ""]]), [[20], [10, 20]]);
  });

  it("is #SPILL! when a cell it needs is taken", () => {
    assert.deepEqual(calculated([["=E1:F1*2", "x"], [""]]).slice(0, 1), [["#SPILL!", "x"]]);
  });
});

describe("SUMPRODUCT", () => {
  it("sums the products of tables of one shape, a cell that is not a number counting as 0", () => {
    assert.deepEqual(answer("=SUMPRODUCT(A1:A3,B1:B3)"), [[140]]);
    assert.deepEqual(answer("=SUMPRODUCT(A1:B3)"), [[66]]);
    assert.deepEqual(answer("=SUMPRODUCT((A1:A3>1)*B1:B3)"), [[50]]);
    assert.deepEqual(answer("=SUMPRODUCT(--(A1:A3>=2),B1:B3)"), [[50]]);
    assert.deepEqual(answer("=SUMPRODUCT(A1:A2,C1:C2)"), [[0]]);
    assert.deepEqual(answer("=SUMPRODUCT({1,2},{3,4})"), [[11]]);
    assert.deepEqual(answer("=SUMPRODUCT({TRUE,FALSE},{1,1})"), [[0]]);
  });

  it("is #VALUE! for tables of different shapes, and the first error cell otherwise", () => {
    assert.deepEqual(answer("=SUMPRODUCT(A1:A3,B1:B2)"), [["#VALUE!"]]);
    assert.deepEqual(answer("=SUMPRODUCT(A1:A3,{1,2,3})"), [["#VALUE!"]]);
    assert.deepEqual(answer("=SUMPRODUCT(A1:A3,C1:C3)"), [["#DIV/0!"]]);
  });
});

describe("combinedShape and alignedIndex", () => {
  it("takes the largest height and width, repeats a length of 1, and has nothing past a shorter end", () => {
    assert.deepEqual(
      combinedShape([
        { rows: 1, columns: 3 },
        { rows: 2, columns: 1 },
      ]),
      { rows: 2, columns: 3 },
    );
    assert.equal(alignedIndex(1, 4), 0);
    assert.equal(alignedIndex(3, 2), 2);
    assert.equal(alignedIndex(3, 3), -1);
  });
});

const baseSeed = Number(process.env.ARRAY_SEED ?? Date.now() % 1_000_000);

describe(`properties over generated formulas (seed ${baseSeed})`, () => {
  it("an element of an expression over ranges is what the same formula over that element's cells answers", () => {
    const random = seededRandom(baseSeed);
    const cellValue = (): CellValue => (random() < 0.2 ? "" : Math.round(random() * 40 - 20));
    Array.from({ length: 20 }).forEach(() => {
      const height = 1 + Math.floor(random() * 6);
      const rows = Array.from({ length: height }, () => [cellValue(), cellValue()]);
      const operators = ["+", "-", "*", "/", "&", ">", "="];
      const operator = operators[Math.floor(random() * operators.length)] ?? "*";
      const label = `seed ${baseSeed}: ${JSON.stringify(rows)} ${operator}`;
      const sheet = calculated(rows.map((row, r) => [...row, r === 0 ? `=A1:A${height}${operator}B1:B${height}` : "", `=A${r + 1}${operator}B${r + 1}`]));
      assert.deepEqual(
        sheet.map((row) => row[2]),
        sheet.map((row) => row[3]),
        label,
      );
    });
  });

  it("SUMPRODUCT of two ranges is the SUM of their product, and the sum of the row products", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: 20 }).forEach(() => {
      const height = 1 + Math.floor(random() * 8);
      const rows = Array.from({ length: height }, () => [Math.round(random() * 20 - 10), Math.round(random() * 20 - 10)]);
      const expected = rows.reduce((sum, [a = 0, b = 0]) => sum + a * b, 0);
      const [first] = calculated([...rows.map((row) => [...row]), [`=SUMPRODUCT(A1:A${height},B1:B${height})`, `=SUM(A1:A${height}*B1:B${height})`]]).slice(
        height,
      );
      assert.deepEqual(first, [expected, expected], `seed ${baseSeed}: ${JSON.stringify(rows)}`);
    });
  });

  it("a formula of single values, calls and text holding colons and braces has no array operand", () => {
    const random = seededRandom(baseSeed + 2);
    const pick = (items: string[]): string => items[Math.floor(random() * items.length)] ?? "";
    const operands = [
      "A1",
      "$B$2",
      "Data!A1",
      "'My Sheet'!B2",
      '"a:b"',
      '"{1,2}"',
      '"A1:A3"',
      "3",
      "TRUE",
      "SUM(A1:A3)",
      'COUNTIF(A1:A5,">2")',
      "LOG10(100)",
      "INDEX(A1:C3,2)",
      "SUM({1,2})",
      "NOPE(A1:A3)",
    ];
    const operators = ["+", "-", "*", "/", "&", "=", "<>", "^"];
    const expression = (depth: number): string => {
      if (depth === 0 || random() < 0.35) return pick(operands);
      const joined = `${expression(depth - 1)}${pick(operators)}${expression(depth - 1)}`;
      return random() < 0.3 ? `(${joined})` : joined;
    };
    Array.from({ length: 300 }).forEach(() => {
      const formula = expression(3);
      assert.deepEqual(operandTexts(formula), [], `seed ${baseSeed}: ${formula}`);
    });
  });
});

describe("an error code written as an element", () => {
  it("is that error value", () => {
    assert.deepEqual(parseArrayConstant("{#DIV/0!}"), [[spreadsheetError("#DIV/0!")]]);
  });
});

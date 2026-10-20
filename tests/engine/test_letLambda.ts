// LET, LAMBDA, MAP, BYROW, BYCOL and REDUCE: how names are written into a formula, Microsoft's
// examples, the argument rules, and properties that hold for any data. Generated cases print their
// seed; rerun one with LAMBDA_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import { inlineLambdaCalls, isValidName, parseLambda, splitArguments, substituteName, substituteNames } from "../../src/engine/nameBinding.ts";
import { seededRandom } from "./seededRandom.ts";

/** What `formula`, written in D1 beside A1:B3 below, spills. */
function answer(
  formula: string,
  rows: CellValue[][] = [
    [1, 10],
    [2, 20],
    [3, 30],
  ],
): CellValue[][] {
  const data = rows.map((row, r) => [...row, "", r === 0 ? formula : ""].map((v) => ({ v })));
  const [sheet] = new SpreadsheetEngine().calculateWorkbook([{ name: "S", data }]);
  return (sheet?.data ?? []).map((row) => row.slice(rows[0]?.length ? rows[0].length + 1 : 1)).filter((row) => row.some((cell) => cell !== ""));
}

describe("writing a name into a formula", () => {
  it("replaces each use of the name, whatever its case, and nothing else", () => {
    const binding = { name: "x", text: "(2)" };
    assert.equal(substituteName("x*X+x1+ax+x.y", binding), "(2)*(2)+x1+ax+x.y");
    assert.equal(substituteName("1x+x", binding), "1x+(2)");
    assert.equal(substituteName("\"x\"&x&'x'!A1", binding), "\"x\"&(2)&'x'!A1");
    assert.equal(substituteName("x!A1+SUM(x)+x(1)", binding), "x!A1+SUM((2))+x(1)");
  });

  it("stops at a nested LET or LAMBDA that binds the name again, the LET's own value still reading the outer one", () => {
    const binding = { name: "x", text: "(1)" };
    assert.equal(substituteName("LET(x, x+1, x*2)+x", binding), "LET(x, (1)+1, x*2)+(1)");
    assert.equal(substituteName("LET(y, x, x, 5, x+y)", binding), "LET(y, (1), x, 5, x+y)");
    assert.equal(substituteName("LAMBDA(x, x+1)(x)", binding), "LAMBDA(x, x+1)((1))");
    assert.equal(substituteName("LAMBDA(v, v+x)", binding), "LAMBDA(v, v+(1))");
  });

  it("inlines a call of a name bound to a LAMBDA, and writes the LAMBDA where the name is only used", () => {
    const binding = { name: "f", lambda: { params: ["v"], body: "v*10" } };
    assert.equal(substituteName("f(3)+1", binding), "((3)*10)+1");
    assert.equal(substituteName("MAP(A1:A3, f)", binding), "MAP(A1:A3, LAMBDA(v, v*10))");
  });

  it("lets a later binding of the same name win", () => {
    assert.equal(
      substituteNames("x", [
        { name: "x", text: "(1)" },
        { name: "x", text: "(2)" },
      ]),
      "(2)",
    );
  });

  it("accepts names Excel accepts, and refuses cell-like names, logical values, R and C", () => {
    ["x", "rate", "_tmp", "total.2", "Row"].forEach((name) => assert.equal(isValidName(name), true, name));
    ["A1", "xfd1", "TRUE", "false", "r", "C", "1x", "a b", ""].forEach((name) => assert.equal(isValidName(name), false, name));
  });

  it("splits arguments on their top-level commas only", () => {
    assert.deepEqual(splitArguments(' a , SUM(1,2), {1,2}, "a,b" '), ["a", "SUM(1,2)", "{1,2}", '"a,b"']);
  });

  it("reads a LAMBDA, and inlines one called where it is written", () => {
    assert.deepEqual(parseLambda(" lambda(a, b, a+b) "), { params: ["a", "b"], body: "a+b" });
    ["LAMBDA(1, 2)", "LAMBDA()", "LAMBDA(x, x)+1", "SUM(x)"].forEach((text) => assert.equal(parseLambda(text), null, text));
    assert.equal(inlineLambdaCalls("LAMBDA(x, x*2)(3)+1"), "((3)*2)+1");
    assert.equal(inlineLambdaCalls('"LAMBDA(x, x)(1)"'), '"LAMBDA(x, x)(1)"');
    assert.equal(inlineLambdaCalls('" LAMBDA(x, x)(1)"'), '" LAMBDA(x, x)(1)"');
    assert.equal(inlineLambdaCalls("LAMBDA(x, y, x+y)(1)"), null);
  });
});

describe("LET", () => {
  it("names values, a later one using the earlier ones", () => {
    assert.deepEqual(answer("=LET(x,2,x*3)"), [[6]]);
    assert.deepEqual(answer("=LET(a,1,b,a+1,a+b)"), [[3]]);
    assert.deepEqual(answer("=LET(total,SUM(A1:A3),total/COUNT(A1:A3))"), [[2]]);
    assert.deepEqual(answer('=LET(s,"hi",s&"!")'), [["hi!"]]);
    assert.deepEqual(answer('=LET(x,TRUE,IF(x,"y","n"))'), [["y"]]);
  });

  it("keeps a range a range, and answers a table where the calculation is one", () => {
    assert.deepEqual(answer("=LET(x,A1:A3,SUM(x))"), [[6]]);
    assert.deepEqual(answer("=LET(x,A1:A3,x*2)"), [[2], [4], [6]]);
    assert.deepEqual(answer("=LET(x,SORT(A1:A3,1,-1),x+0)"), [[3], [2], [1]]);
    assert.deepEqual(answer("=LET(x,A1:A3,ROWS(x))"), [[3]]);
  });

  it("holds an error as a value, which matters only where it is used", () => {
    assert.deepEqual(answer("=LET(x,1/0,IF(TRUE,1,x))"), [[1]]);
    assert.deepEqual(answer("=LET(x,1/0,x+1)"), [["#DIV/0!"]]);
  });

  it("gives back text exactly, quotes and backslashes included, wherever the value was computed", () => {
    const rows = [
      ['say "hi" \\ ok', 1],
      ["b", 2],
      ["c", 3],
    ];
    const text = 'say "hi" \\ ok';
    assert.deepEqual(answer('=LET(x,A1&"",x)', rows), [[text]]);
    assert.deepEqual(answer('=LET(x,A1&"",LEN(x))', rows), [[text.length]]);
    assert.deepEqual(answer('=LET(x,A1&"",x&"!")', rows), [[`${text}!`]]);
    assert.deepEqual(answer("=MAP(SORT(A1:A2),LAMBDA(v,v))", rows), [["b"], [text]]);
    assert.deepEqual(answer('=REDUCE("",A1:A1,LAMBDA(acc,v,acc&v))', rows), [[text]]);
  });

  it("releases what it held: the call written for a value answers #REF! afterwards", () => {
    assert.deepEqual(answer("=LET(x,1+1,x)+LET.VALUE(1)"), [["#REF!"]]);
  });

  it("reads a blank cell bound to a name as a reference to it does", () => {
    const rows = [
      [1, ""],
      [2, 20],
      [3, 30],
    ];
    assert.deepEqual(answer('=LET(x,B1,x&"!")', rows), [["!"]]);
    assert.deepEqual(answer('=MAP(B1:B2,LAMBDA(v,v&"!"))', rows), [["!"], ["20!"]]);
  });

  it("lets a nested LET bind a name again", () => {
    assert.deepEqual(answer("=LET(x,1,LET(x,x+1,x))"), [[2]]);
    assert.deepEqual(answer("=LET(x,1,y,LET(x,x+10,x*2),x+y)"), [[23]]);
  });

  it("is #NAME? for a name Excel would refuse, and #VALUE! without a calculation", () => {
    assert.deepEqual(answer("=LET(A1,2,3)"), [["#NAME?"]]);
    assert.deepEqual(answer("=LET(x,1,y,2)"), [["#VALUE!"]]);
  });
});

describe("LAMBDA, MAP, BYROW, BYCOL and REDUCE", () => {
  it("calls a LAMBDA where it is written or through a name, and is #CALC! uncalled, #VALUE! with the wrong arguments", () => {
    assert.deepEqual(answer("=LAMBDA(x,x*2)(5)"), [[10]]);
    assert.deepEqual(answer("=LET(f,LAMBDA(v,v*10),f(3))"), [[30]]);
    assert.deepEqual(answer("=LET(f,LAMBDA(v,v*10),f(1+2))"), [[30]]);
    assert.deepEqual(answer("=LET(x,5,LAMBDA(x,x*2)(3)+x)"), [[11]]);
    assert.deepEqual(answer("=LAMBDA(x,x*2)"), [["#CALC!"]]);
    assert.deepEqual(answer("=LAMBDA(x,y,x+y)(1)"), [["#VALUE!"]]);
  });

  it("MAP: Microsoft's example, several arrays, and names from an enclosing LET", () => {
    const grid = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    assert.deepEqual(answer("=MAP(A1:C2,LAMBDA(a,IF(a>4,a*a,a)))", grid), [
      [1, 2, 3],
      [4, 25, 36],
    ]);
    assert.deepEqual(answer("=MAP(A1:A3,B1:B3,LAMBDA(a,b,a+b))"), [[11], [22], [33]]);
    assert.deepEqual(answer("=MAP(A1:A3,{1;2},LAMBDA(a,b,a+b))"), [[2], [4], ["#N/A"]]);
    assert.deepEqual(answer("=LET(x,5,MAP(A1:A3,LAMBDA(v,v+x)))"), [[6], [7], [8]]);
    assert.deepEqual(answer("=MAP(SEQUENCE(3),LAMBDA(x,x*2))"), [[2], [4], [6]]);
    assert.deepEqual(answer("=MAP(A1:A3,LAMBDA(x,x+{1,2}))"), [["#CALC!"], ["#CALC!"], ["#CALC!"]]);
    assert.deepEqual(answer("=MAP(A1:A3,LAMBDA(a,b,a))"), [["#VALUE!"]]);
  });

  it("BYROW and BYCOL: a range's row is that row's range, a table's an array constant", () => {
    assert.deepEqual(answer("=BYROW(A1:B3,LAMBDA(row,SUM(row)))"), [[11], [22], [33]]);
    assert.deepEqual(answer("=BYCOL(A1:B3,LAMBDA(col,MAX(col)))"), [[3, 30]]);
    assert.deepEqual(answer("=BYROW(SEQUENCE(2,2),LAMBDA(row,SUM(row)))"), [[3], [7]]);
    assert.deepEqual(answer("=BYROW(A1:B3,LAMBDA(row,row*2))"), [["#CALC!"], ["#CALC!"], ["#CALC!"]]);
  });

  it("REDUCE: Microsoft's sum of squares, an initial value left out being 0, and a product from 1", () => {
    const grid = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    assert.deepEqual(answer("=REDUCE(,A1:C2,LAMBDA(a,b,a+b^2))", grid), [[91]]);
    assert.deepEqual(answer("=REDUCE(1,A1:A3,LAMBDA(a,b,a*b))"), [[6]]);
    assert.deepEqual(answer("=REDUCE(0,A1:B3,LAMBDA(acc,v,acc+v))"), [[66]]);
    assert.deepEqual(answer("=REDUCE(0,A1:A3,LAMBDA(acc,v,VSTACK(acc,v)))"), [[0], [1], [2], [3]]);
    assert.deepEqual(answer('=REDUCE("",A1:B2,LAMBDA(acc,v,acc&v&" "))'), [["1 10 2 20 "]]);
  });
});

const baseSeed = Number(process.env.LAMBDA_SEED ?? Date.now() % 1_000_000);

describe(`properties over generated data (seed ${baseSeed})`, () => {
  it("MAP with a LAMBDA is the same expression over the range, element by element; REDUCE with + is SUM; BYROW with SUM is each row's SUM", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: 15 }).forEach(() => {
      const height = 1 + Math.floor(random() * 5);
      const rows = Array.from({ length: height }, () => [Math.round(random() * 40 - 20), Math.round(random() * 40 - 20)]);
      const label = `seed ${baseSeed}: ${JSON.stringify(rows)}`;
      assert.deepEqual(answer(`=MAP(A1:B${height},LAMBDA(v,v*3-1))`, rows), answer(`=A1:B${height}*3-1`, rows), label);
      assert.deepEqual(answer(`=REDUCE(0,A1:B${height},LAMBDA(a,v,a+v))`, rows), answer(`=SUM(A1:B${height})`, rows), label);
      assert.deepEqual(
        answer(`=BYROW(A1:B${height},LAMBDA(row,SUM(row)))`, rows),
        rows.map(([a = 0, b = 0]) => [a + b]),
        label,
      );
    });
  });
});

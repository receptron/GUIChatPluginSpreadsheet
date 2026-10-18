// How a handler reads its arguments, independent of what it computes: left to
// right, stopping at the first one that is missing or throws, with an omitted
// optional argument behaving exactly like its default passed explicitly.
// Every arity and every throwing position is generated, so a handler that reads
// a later argument first, or keeps going past a failure, goes red here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { functionRegistry, tooFewArgumentsError, type FunctionContext } from "../../src/engine/registry.ts";
import type { CellValue } from "../../src/engine/types.ts";
import "../../src/engine/functions/index.ts";

const THROWING_ARG = "THROWS";

interface HandlerShape {
  name: string;
  requiredCount: number;
  optionalDefaults: number[];
}

const ANNUITY_SHAPES: HandlerShape[] = [
  { name: "FV", requiredCount: 3, optionalDefaults: [0, 0] },
  { name: "PV", requiredCount: 3, optionalDefaults: [0, 0] },
  { name: "PMT", requiredCount: 3, optionalDefaults: [0, 0] },
  { name: "NPER", requiredCount: 3, optionalDefaults: [0, 0] },
  { name: "RATE", requiredCount: 3, optionalDefaults: [0, 0, 0.1] },
  { name: "IPMT", requiredCount: 4, optionalDefaults: [0, 0] },
  { name: "PPMT", requiredCount: 4, optionalDefaults: [0, 0] },
];

const LOCATE_SHAPES: HandlerShape[] = [
  { name: "FIND", requiredCount: 2, optionalDefaults: [1] },
  { name: "SEARCH", requiredCount: 2, optionalDefaults: [1] },
];

/** Distinct, valid operands per position, so a swapped read changes the result. */
const ANNUITY_VALUES = [0.05, 12, -100, 1000, 1, 0.2];
const LOCATE_VALUES: CellValue[] = ["o", "Hello World", 2];

interface Outcome {
  evaluated: string[];
  result: string;
}

const callHandler = (name: string, args: string[], values: CellValue[]): Outcome => {
  const evaluated: string[] = [];
  const context: FunctionContext = {
    functionName: name,
    getCellValue: () => 0,
    getRangeValues: () => [],
    evaluateFormula: (formula) => {
      evaluated.push(formula);
      if (formula === THROWING_ARG) throw new Error(`evaluating ${formula}`);
      return values[Number(formula.slice(1))] ?? 0;
    },
  };
  const definition = functionRegistry.get(name);
  if (!definition) throw new Error(`${name} is not registered`);
  try {
    return { evaluated, result: `ok:${String(definition.handler(args, context))}` };
  } catch (error) {
    return { evaluated, result: `threw:${error instanceof Error ? error.message : String(error)}` };
  }
};

/** The read order the shape promises: every required index, then each optional one that was passed. */
const expectedOutcome = (shape: HandlerShape, args: string[]): Pick<Outcome, "evaluated"> & { failure?: string } => {
  const readIndexes = [
    ...Array(shape.requiredCount).keys(),
    ...shape.optionalDefaults.map((_, offset) => shape.requiredCount + offset).filter((index) => index < args.length),
  ];
  const evaluated: string[] = [];
  for (const index of readIndexes) {
    const arg = args[index];
    if (arg === undefined) return { evaluated, failure: tooFewArgumentsError(shape.name, index + 1).message };
    evaluated.push(arg);
    if (arg === THROWING_ARG) return { evaluated, failure: `evaluating ${THROWING_ARG}` };
  }
  return { evaluated };
};

const argList = (count: number, throwAt: number | undefined): string[] =>
  Array.from({ length: count }, (_, index) => (index === throwAt ? THROWING_ARG : `a${index}`));

/** Every argument count up to the maximum, each with no throwing argument and with one at every position. */
const generatedArgLists = (shape: HandlerShape): string[][] =>
  [...Array(shape.requiredCount + shape.optionalDefaults.length + 1).keys()].flatMap((count) =>
    [undefined, ...Array(count).keys()].map((throwAt) => argList(count, throwAt)),
  );

const checkReadOrder = (shape: HandlerShape, values: CellValue[]): number => {
  const argLists = generatedArgLists(shape);
  argLists.forEach((args) => {
    const actual = callHandler(shape.name, args, values);
    const expected = expectedOutcome(shape, args);
    assert.deepEqual(actual.evaluated, expected.evaluated, `${shape.name}(${args.join(", ")}) read order`);
    if (expected.failure !== undefined) assert.equal(actual.result, `threw:${expected.failure}`, `${shape.name}(${args.join(", ")}) first failure`);
  });
  return argLists.length;
};

const checkDefaults = (shape: HandlerShape, values: CellValue[]): void => {
  const defaults: CellValue[] = shape.optionalDefaults;
  shape.optionalDefaults.forEach((_, index) => {
    const omitted = index + 1;
    const passedCount = shape.requiredCount + shape.optionalDefaults.length - omitted;
    const explicitValues = [...values.slice(0, passedCount), ...defaults.slice(shape.optionalDefaults.length - omitted)];
    const short = callHandler(shape.name, argList(passedCount, undefined), values);
    const explicit = callHandler(shape.name, argList(passedCount + omitted, undefined), explicitValues);
    assert.equal(short.result, explicit.result, `${shape.name} with ${omitted} optional argument(s) omitted`);
  });
};

describe("annuity handlers read their arguments in order", () => {
  for (const shape of ANNUITY_SHAPES) {
    it(`${shape.name}: left to right, stopping at the first missing or throwing argument`, () => {
      assert.ok(checkReadOrder(shape, ANNUITY_VALUES) > shape.requiredCount);
    });
    it(`${shape.name}: an omitted optional argument equals its default`, () => {
      checkDefaults(shape, ANNUITY_VALUES);
    });
  }
});

describe("FIND and SEARCH read their arguments in order", () => {
  for (const shape of LOCATE_SHAPES) {
    it(`${shape.name}: left to right, stopping at the first missing or throwing argument`, () => {
      assert.ok(checkReadOrder(shape, LOCATE_VALUES) > shape.requiredCount);
    });
  }

  it("only SEARCH ignores case", () => {
    const values: CellValue[] = ["h", "Hello"];
    assert.equal(callHandler("SEARCH", argList(2, undefined), values).result, "ok:1");
    assert.equal(callHandler("FIND", argList(2, undefined), values).result, "ok:#VALUE!");
  });
});

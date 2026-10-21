import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRegisteredFunction, registeredFunctionsByCategory } from "../../src/core/index.js";
import { functionRegistry } from "../../src/engine/functions/index.js";
import { calculateWith, loadCustomFunctions } from "../../src/engine/customFunctions.js";

const listedNames = (): string[] => Object.values(registeredFunctionsByCategory()).flat();

describe("registeredFunctionsByCategory", () => {
  it("lists every documented registered function once, sorted within its category", () => {
    const documented = functionRegistry.getAllFunctions().filter((definition) => definition.internal !== true);
    assert.deepEqual(listedNames().sort(), documented.map((definition) => definition.name).sort());
    assert.equal(new Set(listedNames()).size, listedNames().length);
    Object.values(registeredFunctionsByCategory()).forEach((names) => assert.deepEqual(names, [...names].sort()));
  });

  it("files each function under its own category", () => {
    Object.entries(registeredFunctionsByCategory()).forEach(([category, names]) =>
      names.forEach((name) => assert.equal(functionRegistry.get(name)?.category ?? "Other", category, name)),
    );
  });

  it("leaves the engine's internal functions out", () => {
    const internal = functionRegistry.getAllFunctions().filter((definition) => definition.internal === true);
    assert.ok(internal.length > 0, "the engine has internal functions");
    internal.forEach((definition) => assert.ok(!listedNames().includes(definition.name), definition.name));
  });

  it("carries the functions added since 4.0", () => {
    ["CORREL", "SUMIFS", "NORM.DIST", "ROW", "LOG10"].forEach((name) => assert.ok(listedNames().includes(name), name));
  });

  it("is a fresh copy each call", () => {
    const first = registeredFunctionsByCategory();
    Object.values(first).forEach((names) => names.splice(0));
    assert.ok(listedNames().length > 0);
  });
});

describe("isRegisteredFunction", () => {
  it("is true for a registered name in any case", () => {
    ["SUM", "sum", "Sum", "norm.dist", "LOG10"].forEach((name) => assert.equal(isRegisteredFunction(name), true, name));
  });

  it("agrees with the list for every listed name", () => {
    listedNames().forEach((name) => assert.equal(isRegisteredFunction(name), true, name));
  });

  it("is false for names the engine does not have", () => {
    ["", "NOPE", "SUMM", "SUM ", " SUM", "A1", "MOVING.AVG"].forEach((name) => assert.equal(isRegisteredFunction(name), false, JSON.stringify(name)));
  });

  it("does not count a workbook's own function, even while that workbook is calculated", async () => {
    const set = await loadCustomFunctions([{ functions: [{ name: "MY.DOUBLE", params: ["x"], body: "return x * 2;" }] }]);
    try {
      const seen = calculateWith(set, () => ({ visible: functionRegistry.hasFunction("MY.DOUBLE"), registered: isRegisteredFunction("MY.DOUBLE") }));
      assert.deepEqual(seen, { visible: true, registered: false });
    } finally {
      set.dispose();
    }
  });
});

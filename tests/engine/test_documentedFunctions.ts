// What the README, the model guidance and the bundled samples say a formula can
// call must be exactly what the engine registers: a documented name the engine
// lacks evaluates to #NAME?, and a registered one the README omits is invisible.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isRegisteredFunction, registeredFunctionsByCategory } from "../../src/core/functionList.ts";
import { SYSTEM_PROMPT, TOOL_DEFINITION } from "../../src/core/definition.ts";
import { samples } from "../../src/core/samples.ts";

const README_PATH = path.join(import.meta.dirname, "../../README.md");
// The engine upper-cases a name before looking it up, so match any case. The
// whole text is scanned rather than just the formulas in it, so a prose word
// written directly before "(" fails the check too — deliberately, as a false
// alarm is cheaper than a missed call.
const FUNCTION_CALL = /\b([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*)\(/g;

/** `### Category` → the backticked names under it, within the README's "Supported Functions" section. */
const readmeFunctionsByCategory = (readme: string): Map<string, string[]> => {
  const start = readme.indexOf("## Supported Functions\n");
  assert.notEqual(start, -1, "README has a Supported Functions section");
  const end = readme.indexOf("\n## ", start + 1);
  const section = readme.slice(start, end === -1 ? undefined : end);
  const entries = section
    .split("\n### ")
    .slice(1)
    .map((block): [string, string[]] => {
      const [heading = "", ...lines] = block.split("\n");
      return [heading.trim(), [...lines.join("\n").matchAll(/`([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*)`/g)].map((match) => match[1] ?? "").toSorted()];
    });
  const headings = entries.map(([heading]) => heading);
  assert.deepEqual(headings, [...new Set(headings)], "each category appears once");
  return new Map(entries);
};

const functionsIn = (formula: string): string[] => [...formula.matchAll(FUNCTION_CALL)].map((match) => match[1] ?? "");

/** Every string value starting with "=" anywhere inside `value`. */
const formulasIn = (value: unknown): string[] => {
  if (typeof value === "string") return value.startsWith("=") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(formulasIn);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(formulasIn);
  return [];
};

/** The names in prose lists such as "functions (SUM, AVERAGE, IF, etc.)", which are not written as calls. */
const listedFunctions = (text: string): string[] =>
  [...text.matchAll(/functions \(([^)]*)\)/g)]
    .flatMap((match) => (match[1] ?? "").split(",").map((item) => item.trim()))
    .filter((item) => /^[A-Z][A-Z0-9]*$/.test(item));

describe("documented functions match the registry", () => {
  it("the README lists every registered function under its category, and nothing else", () => {
    // A Windows checkout gives the README CRLF line endings.
    const documented = readmeFunctionsByCategory(fs.readFileSync(README_PATH, "utf8").replaceAll("\r\n", "\n"));
    assert.deepEqual(Object.fromEntries(documented), registeredFunctionsByCategory());
  });

  // The `functions` field (#114) is where the model DEFINES a workbook's own functions: its example
  // calls one of those, and its body example is JavaScript, so neither is a built-in to look up.
  it("the model guidance only calls registered functions", () => {
    const guidance = `${SYSTEM_PROMPT}\n${JSON.stringify(TOOL_DEFINITION, (key, value: unknown) => (key === "functions" ? undefined : value))}`;
    const called = [...functionsIn(guidance), ...listedFunctions(guidance)];
    assert.ok(listedFunctions(guidance).length > 0, "the guidance lists functions");
    assert.deepEqual(
      called.filter((name) => !isRegisteredFunction(name)),
      [],
    );
  });

  it("the bundled samples only call registered functions", () => {
    const called = formulasIn(samples).flatMap(functionsIn);
    assert.ok(called.length > 0, "the samples contain formulas");
    assert.deepEqual(
      called.filter((name) => !isRegisteredFunction(name)),
      [],
    );
  });
});

describe("the workbook-functions field", () => {
  it("is in the tool definition, and only it was left out of the scan above", () => {
    const sheetProperties = TOOL_DEFINITION.parameters.properties.sheets.items.properties;
    assert.ok("functions" in sheetProperties);
    assert.deepEqual(Object.keys(sheetProperties), ["name", "data", "functions"]);
  });
});

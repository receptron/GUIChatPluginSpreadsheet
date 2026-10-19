/**
 * A workbook's own functions as it stores them (#114), and the rules a definition must meet before
 * any of it runs. Pure: no QuickJS here, so every rule is testable on its own.
 */

import { FUNCTION_NAME_SOURCE } from "./registry";

/** One function a workbook defines: `=MOVING.AVG(B2:B100, 7)` calls `body` with `values` and `n`. */
export interface CustomFunctionSpec {
  name: string;
  params: string[];
  body: string;
  description?: string;
}

/** A definition that cannot be used, and why — said to whoever wrote it. */
export interface CustomFunctionProblem {
  name: string;
  reason: string;
}

const FUNCTION_NAME = new RegExp(`^${FUNCTION_NAME_SOURCE}$`, "i");
// A JavaScript parameter name: what the body refers to the argument by.
const PARAM_NAME = /^[A-Za-z_$][\w$]*$/;
// More than this many parameters is a definition written wrong, not a function anyone calls.
const MAX_PARAMS = 32;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const isSpec = (entry: unknown): entry is CustomFunctionSpec =>
  isRecord(entry) &&
  typeof entry["name"] === "string" &&
  typeof entry["body"] === "string" &&
  isStringArray(entry["params"]) &&
  (entry["description"] === undefined || typeof entry["description"] === "string");

/** The specs a sheet's `functions` holds, skipping anything not shaped like one. */
export function specsOf(functions: unknown): CustomFunctionSpec[] {
  if (!Array.isArray(functions)) return [];
  return functions.filter(isSpec).map(({ name, params, body, description }) => ({ name, params, body, ...(description === undefined ? {} : { description }) }));
}

/** Why `spec` cannot be used, or null when it can. `isBuiltIn` says whether a name is the engine's own. */
export function problemWith(spec: CustomFunctionSpec, isBuiltIn: (name: string) => boolean): string | null {
  if (!FUNCTION_NAME.test(spec.name)) return "a name is letters and digits, parts joined by dots (MOVING.AVG)";
  if (isBuiltIn(spec.name)) return `${spec.name.toUpperCase()} is a built-in function`;
  if (spec.params.length > MAX_PARAMS) return `at most ${MAX_PARAMS} parameters`;
  const badParam = spec.params.find((param) => !PARAM_NAME.test(param));
  if (badParam !== undefined) return `"${badParam}" is not a parameter name`;
  if (new Set(spec.params).size !== spec.params.length) return "a parameter is named twice";
  return null;
}

/** The usable definitions, keyed by upper-case name, and the problems with the rest. A name defined
 *  twice is a problem for the second: which one a formula means would otherwise depend on order. */
export function checkedSpecs(
  specs: CustomFunctionSpec[],
  isBuiltIn: (name: string) => boolean,
): { usable: Map<string, CustomFunctionSpec>; problems: CustomFunctionProblem[] } {
  const usable = new Map<string, CustomFunctionSpec>();
  const problems: CustomFunctionProblem[] = [];
  specs.forEach((spec) => {
    const key = spec.name.toUpperCase();
    const reason = usable.has(key) ? `${key} is defined twice` : problemWith(spec, isBuiltIn);
    if (reason) problems.push({ name: spec.name, reason });
    else usable.set(key, spec);
  });
  return { usable, problems };
}

/** The source QuickJS evaluates to get `spec` as a function. A body can still close the function
 *  early (QuickJS's `Function` joins its source as text); what contains that is the sandbox, and a
 *  context of its own per function, not this string. */
export const functionSource = (spec: CustomFunctionSpec): string =>
  `Function(${[...spec.params, `"use strict";\n${spec.body}`].map((part) => JSON.stringify(part)).join(", ")})`;

// The reference fixtures the generator scripts write: `{ "cases": [...] }` under tests/engine/fixtures.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** The cases of `fixtures/<fileName>`, each checked by `isCase`; the fixture must hold at least one. */
export function referenceCases<T>(fileName: string, isCase: (value: unknown) => value is T): T[] {
  const parsed: unknown = JSON.parse(readFileSync(new URL(`./fixtures/${fileName}`, import.meta.url), "utf8"));
  const cases: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "cases") : undefined;
  assert.ok(Array.isArray(cases) && cases.length > 0 && cases.every(isCase), `${fileName} holds cases`);
  return cases.filter(isCase);
}

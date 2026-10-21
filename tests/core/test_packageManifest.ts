import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest: unknown = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const runtimeRanges = (field: string): [string, unknown][] => {
  const ranges = isRecord(manifest) ? manifest[field] : undefined;
  return isRecord(ranges) ? Object.entries(ranges) : [];
};

// npm 12 refuses URL, git and file specs by default, so one in a published runtime field fails every consumer's install.
const NON_REGISTRY_SPEC = /^(?!npm:)(?:[a-z][a-z0-9+.-]*:|[^@\s/]+\/\S+$)/i;

describe("package.json", () => {
  ["dependencies", "peerDependencies", "optionalDependencies"].forEach((field) => {
    it(`${field} resolve from the registry`, () => {
      const offRegistry = runtimeRanges(field).filter(([, spec]) => typeof spec !== "string" || NON_REGISTRY_SPEC.test(spec));
      assert.deepEqual(offRegistry, []);
    });
  });

  it("recognises the specs npm 12 refuses", () => {
    ["https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz", "git+https://github.com/a/b.git", "github:a/b", "file:../x", "a/b"].forEach((spec) =>
      assert.ok(NON_REGISTRY_SPEC.test(spec), spec),
    );
    ["^0.32.0", "~6.0.3", ">=1 <2", "1.2.3", "*", "latest", "npm:@scope/pkg@^1"].forEach((spec) => assert.ok(!NON_REGISTRY_SPEC.test(spec), spec));
  });
});

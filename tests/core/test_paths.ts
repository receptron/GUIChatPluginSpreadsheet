import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSpreadsheetArtifactPath, spreadsheetArtifactPath, toArtifactsRelative } from "../../src/core/paths.js";

describe("spreadsheetArtifactPath", () => {
  it("partitions by UTC year and month, matching MulmoClaude's layout", () => {
    const { relPath, filePath } = spreadsheetArtifactPath(new Date("2026-01-31T23:30:00-05:00"), "abc123");
    assert.equal(relPath, "spreadsheets/2026/02/abc123.json");
    assert.equal(filePath, "artifacts/spreadsheets/2026/02/abc123.json");
  });

  it("zero-pads single-digit months", () => {
    assert.equal(spreadsheetArtifactPath(new Date(Date.UTC(2026, 8, 1)), "x").relPath, "spreadsheets/2026/09/x.json");
  });

  it("generates a 16-hex file id that passes its own guard", () => {
    const { relPath, filePath } = spreadsheetArtifactPath();
    assert.match(relPath, /^spreadsheets\/\d{4}\/\d{2}\/[0-9a-f]{16}\.json$/);
    assert.ok(isSpreadsheetArtifactPath(filePath));
  });

  it("does not repeat ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => spreadsheetArtifactPath().relPath));
    assert.equal(ids.size, 200);
  });
});

describe("isSpreadsheetArtifactPath", () => {
  const accepted = ["artifacts/spreadsheets/2026/10/0123456789abcdef.json", "artifacts/spreadsheets/legacy.json", "artifacts/spreadsheets/a/b/c.json"];
  accepted.forEach((path) => {
    it(`accepts ${path}`, () => assert.equal(isSpreadsheetArtifactPath(path), true));
  });

  const rejected: [string, unknown][] = [
    ["non-string", 42],
    ["undefined", undefined],
    ["inline sheets", [{ name: "S", data: [] }]],
    ["empty", ""],
    ["another artifacts dir", "artifacts/charts/2026/10/x.json"],
    ["prefix without slash", "artifacts/spreadsheetsX/x.json"],
    ["missing artifacts root", "spreadsheets/2026/10/x.json"],
    ["absolute", "/artifacts/spreadsheets/x.json"],
    ["wrong extension", "artifacts/spreadsheets/x.html"],
    ["parent traversal", "artifacts/spreadsheets/../secrets.json"],
    ["deep traversal", "artifacts/spreadsheets/2026/../../../etc.json"],
    ["dot segment", "artifacts/spreadsheets/./x.json"],
    ["empty segment", "artifacts/spreadsheets//x.json"],
    ["backslash", "artifacts/spreadsheets/..\\x.json"],
  ];
  rejected.forEach(([label, value]) => {
    it(`rejects ${label}`, () => assert.equal(isSpreadsheetArtifactPath(value), false));
  });
});

describe("toArtifactsRelative", () => {
  it("strips the artifacts root", () => {
    assert.equal(toArtifactsRelative("artifacts/spreadsheets/2026/10/x.json"), "spreadsheets/2026/10/x.json");
  });
});

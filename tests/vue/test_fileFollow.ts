// When the host announces that the workbook changed on disk, the View shows the
// file's sheets, unless they are what it already shows (its own save coming
// back) or the JSON editor holds edits that replacing would lose.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileChangeAction } from "../../src/vue/fileFollow.ts";
import type { SpreadsheetSheet } from "../../src/core/types.ts";

const sheet = (value: number): SpreadsheetSheet[] => [{ name: "S", data: [[{ v: value }]] }];

describe("fileChangeAction", () => {
  it("does nothing when the file holds what is shown", () => {
    assert.equal(fileChangeAction(sheet(1), sheet(1), false), "same");
    assert.equal(fileChangeAction(sheet(1), sheet(1), true), "same");
  });

  it("applies a change when nothing is pending", () => {
    assert.equal(fileChangeAction(sheet(2), sheet(1), false), "apply");
  });

  it("holds a change while the JSON editor has unapplied edits", () => {
    assert.equal(fileChangeAction(sheet(2), sheet(1), true), "hold");
  });

  it("treats a renamed sheet or an added row as a change", () => {
    assert.equal(fileChangeAction([{ name: "T", data: [[{ v: 1 }]] }], sheet(1), false), "apply");
    assert.equal(fileChangeAction([{ name: "S", data: [[{ v: 1 }], [{ v: 2 }]] }], sheet(1), false), "apply");
  });
});

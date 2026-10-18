// What the View does when the host announces that its workbook changed on disk.
// Kept free of Vue so each branch is tested directly.

import type { SpreadsheetSheet } from "../core/types";

/** `same`: nothing to do (usually this View's own save coming back).
 *  `apply`: show the file's sheets.
 *  `hold`: keep what is on screen and say the file changed, because the JSON
 *  editor holds edits not yet applied, and replacing them would lose them. */
export type FileChangeAction = "same" | "apply" | "hold";

export function fileChangeAction(onDisk: SpreadsheetSheet[], shown: SpreadsheetSheet[], hasUnappliedEdits: boolean): FileChangeAction {
  if (JSON.stringify(onDisk) === JSON.stringify(shown)) return "same";
  return hasUnappliedEdits ? "hold" : "apply";
}

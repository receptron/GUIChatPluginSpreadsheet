/**
 * Parser Unit Tests
 *
 * The A1-reference PARSING tests that used to live here went with
 * parseCellRef / parseRangeRef / cellRefToA1: the engine resolves references
 * through formulaRefs (expandRange / expandRangeOrCell) now, and those are
 * covered in tests/engine/test_expandRangeOrCell.ts and
 * test_cellRefSubstitution.ts. Column conversion stays because it is still the
 * engine's own public helper, used by the Vue view.
 */

import { describe, test, expect } from "vitest";
import { columnToIndex, indexToColumn } from "../../src/engine/parser";


describe("Parser - Column Conversion", () => {
  describe("columnToIndex", () => {
    test("converts single letters correctly", () => {
      expect(columnToIndex("A")).toBe(0);
      expect(columnToIndex("B")).toBe(1);
      expect(columnToIndex("Z")).toBe(25);
    });

    test("converts double letters correctly", () => {
      expect(columnToIndex("AA")).toBe(26);
      expect(columnToIndex("AB")).toBe(27);
      expect(columnToIndex("AZ")).toBe(51);
      expect(columnToIndex("BA")).toBe(52);
      expect(columnToIndex("ZZ")).toBe(701);
    });

    test("converts triple letters correctly", () => {
      expect(columnToIndex("AAA")).toBe(702);
      expect(columnToIndex("AAB")).toBe(703);
    });
  });

  describe("indexToColumn", () => {
    test("converts single digit indices correctly", () => {
      expect(indexToColumn(0)).toBe("A");
      expect(indexToColumn(1)).toBe("B");
      expect(indexToColumn(25)).toBe("Z");
    });

    test("converts double digit indices correctly", () => {
      expect(indexToColumn(26)).toBe("AA");
      expect(indexToColumn(27)).toBe("AB");
      expect(indexToColumn(51)).toBe("AZ");
      expect(indexToColumn(52)).toBe("BA");
      expect(indexToColumn(701)).toBe("ZZ");
    });

    test("converts triple digit indices correctly", () => {
      expect(indexToColumn(702)).toBe("AAA");
      expect(indexToColumn(703)).toBe("AAB");
    });
  });

  test("columnToIndex and indexToColumn are inverses", () => {
    // Test round-trip conversion
    for (let i = 0; i < 1000; i++) {
      const col = indexToColumn(i);
      expect(columnToIndex(col)).toBe(i);
    }

    const testCols = ["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA", "XFD"];
    for (const col of testCols) {
      const index = columnToIndex(col);
      expect(indexToColumn(index)).toBe(col);
    }
  });
});

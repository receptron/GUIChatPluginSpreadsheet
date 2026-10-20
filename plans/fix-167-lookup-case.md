# fix: the lookups' exact match ignores case (#167)

`findMatchIndex` (MATCH, VLOOKUP, HLOOKUP, XLOOKUP exact) and XLOOKUP's next-smaller/larger path
compared `item == lookupValue`, so `"C"` missed `c`. Two texts now match when `compareText` finds them
equal (case ignored, accents counted, as Excel and as `=` already compare); anything else keeps the
loose comparison it had (`"10"` matches 10), which is a separate question.

Verification: tests/engine/test_lookupCase.ts (red on main); the corpus differential against main shows
no change to any existing formula.

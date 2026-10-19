// The functions the shown workbook defines (#114), loaded when its definitions change. Until a
// load lands the previous set stays in use, so a cell calling one keeps its value rather than
// flashing #NAME? while QuickJS starts.
import { onScopeDispose, shallowRef, watch, type Ref } from "vue";
import { loadCustomFunctions, NO_CUSTOM_FUNCTIONS, type CustomFunctionSet } from "../engine/customFunctions";
import type { SpreadsheetSheet } from "../core/types";

/** What decides the set: every sheet's definitions, as text, so an unrelated cell edit does not reload. */
export const definitionsKey = (sheets: readonly SpreadsheetSheet[]): string => JSON.stringify(sheets.map((sheet) => sheet.functions ?? []));

/** `load` is the loader, swappable so the order two loads land in can be tested. */
export function useCustomFunctions(sheets: Ref<SpreadsheetSheet[]>, load = loadCustomFunctions): Ref<CustomFunctionSet> {
  const current = shallowRef<CustomFunctionSet>(NO_CUSTOM_FUNCTIONS);
  let generation = 0;
  watch(
    () => definitionsKey(sheets.value),
    async () => {
      const mine = ++generation;
      const loaded = await load(sheets.value);
      // A newer workbook arrived while this one loaded: this set is already out of date.
      if (mine !== generation) return loaded.dispose();
      const previous = current.value;
      current.value = loaded;
      previous.dispose();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    generation++;
    current.value.dispose();
  });
  return current;
}

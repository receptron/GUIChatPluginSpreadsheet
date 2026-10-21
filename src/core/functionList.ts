// The functions a formula may call, for a host that names them in its own guidance and
// has to keep that list in step with the engine.

import { functionRegistry } from "../engine/functions/index";

/** Each category's function names, sorted; the engine's internal functions are left out. */
export const registeredFunctionsByCategory = (): Record<string, string[]> =>
  Object.fromEntries(
    [...functionRegistry.getFunctionsByCategory()].map(([category, definitions]) => [category, definitions.map((definition) => definition.name).sort()]),
  );

/** Whether `name` is one of the engine's own functions, in any case. A workbook's own functions are not. */
export const isRegisteredFunction = (name: string): boolean => functionRegistry.isBuiltIn(name);

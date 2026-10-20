/**
 * A workbook's own functions, run in QuickJS (#114).
 *
 * QuickJS is a JavaScript engine compiled to WebAssembly: a function runs inside it with no DOM,
 * no network, no file system and no timers, under a memory cap and a deadline, and a call is
 * synchronous — so the engine's synchronous handlers can call it directly. Only loading the
 * WebAssembly is asynchronous, which is why a caller loads a workbook's functions before
 * calculating it, and a workbook without functions never loads QuickJS at all.
 */

import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSSyncVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import { functionRegistry, answersTable, type FunctionContext, type FunctionDefinition } from "./registry";
// The built-ins registered before any check: a workbook may not redefine one, and asking before
// they are loaded would answer that none exist.
import "./functions";
import { checkedSpecs, functionSource, specsOf, type CustomFunctionProblem, type CustomFunctionSpec } from "./customFunctionSpecs";
import { expandRangeOrCell } from "./formulaRefs";
import { indexToColumn } from "./parser";
import { NUM_ERROR, VALUE_ERROR, isSpreadsheetErrorValue, type SpreadsheetError } from "./spreadsheet-errors";
import type { CellValue } from "./types";

/** One call may run this long before it is stopped (#NUM!). */
const CALL_LIMIT_MS = 50;
/** All the calls of one calculation together may run this long. */
const CALCULATION_LIMIT_MS = 2000;
/** The memory a workbook's functions may use between them. */
const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const STACK_LIMIT_BYTES = 1024 * 1024;
/** The most cells one argument may hand a function. */
const MAX_ARGUMENT_CELLS = 100_000;

// `fn(...JSON.parse(args))`: every argument crosses as one JSON string, so no value is built
// handle by handle on this side.
const CALLER_SOURCE = "(fn, args) => fn(...JSON.parse(args))";

// An optional sheet before a reference: `Data!`, `'My data'!`.
const SHEET = "(?:(?:'(?:[^']|'')+'|[^!'\"(),]+)!)?";
// A range: `$B$2:$C$9`, `Data!B2:B9`. A single cell (`B2`) is a value, not a range.
const RANGE = new RegExp(`^${SHEET}\\$?[A-Z]+\\$?\\d+:\\$?[A-Z]+\\$?\\d+$`, "i");
const SINGLE_CELL = new RegExp(`^${SHEET}\\$?[A-Z]+\\$?\\d+$`, "i");

let quickJSVariant: Promise<QuickJSSyncVariant> | null = null;

/** A QuickJS module of its own for each set of functions. QuickJS can abort while freeing a runtime
 *  (`list_empty(&rt->gc_obj_list)`, seen after a calculation ran out of time), and an aborted module
 *  is unusable: shared, it would take every later workbook's functions with it. Instantiating one is
 *  a few milliseconds; only the code is loaded once, and only when a workbook has functions. */
const newQuickJSModule = async (): Promise<QuickJSWASMModule> => {
  // A failed import is not kept: the next workbook with functions tries again.
  quickJSVariant ??= import("@jitl/quickjs-singlefile-mjs-release-sync").then(
    (variant) => variant.default,
    (error: unknown) => {
      quickJSVariant = null;
      throw error;
    },
  );
  return newQuickJSWASMModuleFromVariant(await quickJSVariant);
};

/** A workbook's functions, ready to be made visible to a calculation with {@link calculateWith}. */
export interface CustomFunctionSet {
  definitions: ReadonlyMap<string, FunctionDefinition>;
  /** The definitions that could not be used, and why. */
  problems: CustomFunctionProblem[];
  /** Marks the start of one calculation, for {@link CALCULATION_LIMIT_MS}. */
  startCalculation(): void;
  dispose(): void;
}

// No clock to start and nothing to release.
const nothingToDo = (): void => undefined;

/** The set for a workbook that defines no functions. */
export const NO_CUSTOM_FUNCTIONS: CustomFunctionSet = { definitions: new Map(), problems: [], startCalculation: nothingToDo, dispose: nothingToDo };

/** Calculate with `set`'s functions visible: `calculateWith(set, () => engine.calculate(sheet, sheets))`. */
export function calculateWith<T>(set: CustomFunctionSet, calculate: () => T): T {
  set.startCalculation();
  return functionRegistry.withOverlay(set.definitions, calculate);
}

/** The functions defined across `sheets` (each sheet's optional `functions`). */
export async function loadCustomFunctions(sheets: readonly { functions?: unknown }[]): Promise<CustomFunctionSet> {
  const specs = sheets.flatMap((sheet) => specsOf(sheet.functions));
  const { usable, problems } = checkedSpecs(specs, (name) => functionRegistry.isBuiltIn(name));
  if (usable.size === 0) return { ...NO_CUSTOM_FUNCTIONS, problems };
  return buildSet(await newQuickJSModule(), usable, problems);
}

function buildSet(module: QuickJSWASMModule, usable: Map<string, CustomFunctionSpec>, problems: CustomFunctionProblem[]): CustomFunctionSet {
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(STACK_LIMIT_BYTES);
  const clock = { calculationStart: Date.now() };
  // Each context with the handles it hands out; a handle is released before its context is.
  const contexts: { vm: QuickJSContext; handles: QuickJSHandle[] }[] = [];
  const definitions = new Map<string, FunctionDefinition>();
  usable.forEach((spec, key) => {
    // A context per function: one definition can change its own globals, never another's.
    const vm = runtime.newContext();
    const handles: QuickJSHandle[] = [];
    contexts.push({ vm, handles });
    // Under a deadline too: a body that closes its function early runs code right here.
    const compiled = underDeadline(runtime, Date.now() + CALL_LIMIT_MS, () => {
      const result = vm.evalCode(functionSource(spec));
      return result.error ? { error: messageOf(vm, result.error) || "it stopped while loading" } : { fn: result.value };
    });
    if ("error" in compiled) {
      problems.push({ name: spec.name, reason: `does not compile: ${compiled.error}` });
      return;
    }
    const caller = vm.unwrapResult(vm.evalCode(CALLER_SOURCE));
    handles.push(compiled.fn, caller);
    const call = { vm, runtime, caller, fn: compiled.fn };
    definitions.set(
      key,
      definitionFor(spec, (json) => callInVm(call, json, clock.calculationStart)),
    );
  });
  // Never throws: if QuickJS aborts while freeing, this set's module is simply dropped with it.
  const dispose = () => {
    try {
      contexts.forEach(({ vm, handles }) => {
        handles.forEach((handle) => handle.dispose());
        vm.dispose();
      });
      runtime.dispose();
    } catch {
      // The module is this set's alone; nothing else uses it.
    }
  };
  return { definitions, problems, startCalculation: () => (clock.calculationStart = Date.now()), dispose };
}

/** The `message` of what a VM call threw, or "" when it has none that is text; the handle released.
 *  Reading `message` can run a getter, so it is read under the caller's deadline. */
function messageOf(vm: QuickJSContext, error: QuickJSHandle): string {
  try {
    const message = vm.getProp(error, "message");
    const text = vm.typeof(message) === "string" ? vm.getString(message) : "";
    message.dispose();
    return text;
  } catch {
    return "";
  } finally {
    error.dispose();
  }
}

type Invoke = (argumentsJson: string) => CellValue;

/** One compiled function and the context it lives in. */
interface CompiledCall {
  vm: QuickJSContext;
  runtime: QuickJSRuntime;
  caller: QuickJSHandle;
  fn: QuickJSHandle;
}

/** Run one call: the arguments as JSON, under the call's deadline and what is left of the calculation's. */
function callInVm({ vm, runtime, caller, fn }: CompiledCall, json: string, calculationStart: number): CellValue {
  const deadline = Math.min(Date.now() + CALL_LIMIT_MS, calculationStart + CALCULATION_LIMIT_MS);
  if (Date.now() >= deadline) return NUM_ERROR;
  return underDeadline(runtime, deadline, () => {
    const argsHandle = vm.newString(json);
    const result = vm.callFunction(caller, vm.undefined, fn, argsHandle);
    argsHandle.dispose();
    if (result.error) return messageOf(vm, result.error) === INTERRUPTED ? NUM_ERROR : VALUE_ERROR;
    const value = primitiveOf(vm, result.value);
    result.value.dispose();
    return value;
  });
}

// What QuickJS's interrupt throws.
const INTERRUPTED = "interrupted";

/** Run `work` with the VM interrupted at `deadline` — every step that can execute workbook code:
 *  the call, and reading what it returned or threw (a getter, a toJSON, a Proxy all run code). */
function underDeadline<T>(runtime: QuickJSRuntime, deadline: number, work: () => T): T {
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(deadline));
  try {
    return work();
  } finally {
    runtime.removeInterruptHandler();
  }
}

/** A returned value as a cell holds it, read by its type alone: an object is #VALUE! without
 *  being serialized, since serializing it would run its toJSON or getters. */
function primitiveOf(vm: QuickJSContext, handle: QuickJSHandle): CellValue {
  const kind = vm.typeof(handle);
  if (kind === "number") return asCellValue(vm.getNumber(handle));
  if (kind === "string") return vm.getString(handle);
  if (kind === "boolean") return asCellValue(vm.dump(handle));
  return VALUE_ERROR;
}

/** What a function returned, as a cell holds it: a finite number, text or a logical; else an error. */
export function asCellValue(value: unknown): CellValue {
  if (typeof value === "number") return Number.isFinite(value) ? value : NUM_ERROR;
  if (typeof value === "string" || typeof value === "boolean") return value;
  return VALUE_ERROR;
}

function definitionFor(spec: CustomFunctionSpec, invoke: Invoke): FunctionDefinition {
  const description = spec.description ?? `Defined in this workbook (${spec.params.join(", ")})`;
  return {
    name: spec.name.toUpperCase(),
    minArgs: spec.params.length,
    maxArgs: spec.params.length,
    description,
    category: "Workbook",
    handler: (args, context) => {
      const values = args.map((arg) => argumentValue(arg.trim(), context));
      const failed = values.find(isSpreadsheetErrorValue);
      return failed ?? invoke(JSON.stringify(values));
    },
  };
}

type JsonCell = number | string | boolean | null;
type ArgumentValue = JsonCell | JsonCell[][] | SpreadsheetError;

/** A cell value as the function sees it: a blank is null, an error stops the call. */
const toJsonCell = (value: CellValue): JsonCell | SpreadsheetError => {
  if (isSpreadsheetErrorValue(value)) return value;
  return value === "" ? null : value;
};

/** One argument: a range as rows of cells, anything else — a single cell included — as its value. */
function argumentValue(arg: string, context: FunctionContext): ArgumentValue {
  if (RANGE.test(arg)) return rangeRows(arg, context);
  if (answersTable(arg) && context.getRangeGrid) return tableRows(context.getRangeGrid(arg));
  // Read like a range's cells, so a blank one is null here too rather than the 0 a formula reads.
  if (SINGLE_CELL.test(arg)) return toJsonCell(cellsReader(context)(arg)[0] ?? "");
  return toJsonCell(context.evaluateFormula(arg));
}

/** The table a spilling call answers, as rows of cells; an error cell stops the call, as in a range. */
function tableRows(table: CellValue[][]): JsonCell[][] | SpreadsheetError {
  if (table.reduce((count, row) => count + row.length, 0) > MAX_ARGUMENT_CELLS) return VALUE_ERROR;
  const rows = table.map((row) => row.map(toJsonCell));
  const failed = rows.flat().find(isSpreadsheetErrorValue);
  return failed ?? rows.map((row) => row.filter((cell): cell is JsonCell => !isSpreadsheetErrorValue(cell)));
}

/** The reader that keeps a blank cell as "" where the host offers one. */
const cellsReader = (context: FunctionContext) => context.getRangeValuesKeepingBlanks ?? context.getRangeValuesRaw ?? context.getRangeValues;

/** The cells `reference` names, row by row, read one by one so a cell past the sheet's last
 *  column still takes its place (as null) and every row is as wide as the range. */
function rangeRows(reference: string, context: FunctionContext): JsonCell[][] | SpreadsheetError {
  const bang = reference.lastIndexOf("!");
  const sheetPrefix = bang >= 0 ? reference.slice(0, bang + 1) : "";
  const coords = expandRangeOrCell(reference.slice(bang + 1)) ?? [];
  if (coords.length > MAX_ARGUMENT_CELLS) return VALUE_ERROR;
  const read = cellsReader(context);
  const rows = new Map<number, JsonCell[]>();
  for (const { row, col } of coords) {
    const cell = toJsonCell(read(`${sheetPrefix}${indexToColumn(col)}${row + 1}`)[0] ?? "");
    if (isSpreadsheetErrorValue(cell)) return cell;
    rows.set(row, [...(rows.get(row) ?? []), cell]);
  }
  return Array.from(rows.values());
}

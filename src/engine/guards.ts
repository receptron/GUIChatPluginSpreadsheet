// The three runtime helpers the engine needs, kept here so the engine stays what
// its own header claims: framework-agnostic, with nothing above it to import.
//
// They arrive with the engine that was developed in MulmoClaude, where they came
// from that repo's own leaf package. Copied rather than depended on: a
// gui-chat plugin must not take a dependency on a host's packages.

/** Narrow `unknown` to a plain object (not null, not array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrow `unknown` to any object (not null, arrays allowed).
 *  Use `isRecord` when you need to access string keys. */
export function isObj(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

const hasStringProp = <K extends string>(value: unknown, key: K): value is Record<K, string> & Record<string, unknown> =>
  isRecord(value) && typeof value[key] === "string";

/** The message to show for a thrown value. A non-Error object with a non-empty
 *  string `details` (the gRPC convention) or `message` surfaces that field —
 *  `details` wins — instead of the `[object Object]` a bare `String(err)`
 *  would print. */
export function errorMessage(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message;
  if (hasStringProp(err, "details") && err.details) return err.details;
  if (hasStringProp(err, "message") && err.message) return err.message;
  if (fallback !== undefined) return fallback;
  return String(err);
}

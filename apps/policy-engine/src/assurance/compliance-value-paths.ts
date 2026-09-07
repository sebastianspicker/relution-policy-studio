/** Reads and prunes dot-delimited paths in compliance mapping values. */
import type { JsonRecord } from "./compliance-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").filter((part) => part.length > 0).reduce<unknown>((current, part) => {
    const record = asRecord(current);
    return record?.[part];
  }, value);
}

export function withoutPaths(value: unknown, paths: ReadonlySet<string>, prefix = ""): unknown {
  // Undefined is the pruning signal, so explicit undefined values are omitted.
  if (paths.has(prefix)) return undefined;
  const record = asRecord(value);
  if (record === undefined) return value;
  const next: JsonRecord = {};
  for (const [key, child] of Object.entries(record)) {
    const childPath = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (paths.has(childPath)) continue;
    const pruned = withoutPaths(child, paths, childPath);
    if (pruned !== undefined) next[key] = pruned;
  }
  return next;
}

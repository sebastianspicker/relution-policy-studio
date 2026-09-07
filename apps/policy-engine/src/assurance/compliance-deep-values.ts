/** Compares and merges nested compliance values without discarding stable UUIDs. */
import type { JsonRecord } from "./compliance-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function deepSubsetMatch(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((entry, index) => deepSubsetMatch(entry, actual[index]));
  }
  const expectedRecord = asRecord(expected);
  if (expectedRecord !== undefined) {
    const actualRecord = asRecord(actual);
    return actualRecord !== undefined
      && Object.entries(expectedRecord).every(([key, value]) => deepSubsetMatch(value, actualRecord[key]));
  }
  return Object.is(expected, actual);
}

export function deepMergePreservingExistingUuids(existingValue: unknown, importedValue: unknown): JsonRecord {
  const existing = asRecord(existingValue) ?? {};
  const imported = asRecord(importedValue);
  if (imported === undefined) return structuredClone(existing) as JsonRecord;
  const merged = structuredClone(existing) as JsonRecord;
  for (const [key, value] of Object.entries(imported)) {
    if (key === "uuid" && typeof merged.uuid === "string" && merged.uuid.length > 0) continue;
    const existingChild = asRecord(merged[key]);
    const importedChild = asRecord(value);
    merged[key] = existingChild !== undefined && importedChild !== undefined
      ? deepMergePreservingExistingUuids(existingChild, importedChild)
      : structuredClone(value);
  }
  return merged;
}

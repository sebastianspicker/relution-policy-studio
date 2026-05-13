import { asRecord } from "./editor-utils.js";
import type { JsonRecord } from "./types.js";

export function parseSettingDetailsJson(text: string): JsonRecord {
  const parsed = JSON.parse(text) as unknown;
  const record = asRecord(parsed);
  if (record === undefined) {
    throw new Error("Local JSON import must contain one object");
  }
  const details = asRecord(record.details);
  if (details !== undefined) {
    return details;
  }
  if (typeof record.type !== "string" || record.type.length === 0) {
    throw new Error("Local JSON import must include details.type or top-level type");
  }
  return record;
}

export function mergeSettingDetails(existingDetails: JsonRecord, importedDetails: JsonRecord): JsonRecord {
  if (typeof existingDetails.type === "string" && typeof importedDetails.type === "string" && existingDetails.type !== importedDetails.type) {
    throw new Error(`Setting JSON type ${importedDetails.type} does not match selected setting type ${existingDetails.type}`);
  }
  return deepMergePreservingExistingUuids(existingDetails, importedDetails);
}

function deepMergePreservingExistingUuids(existingValue: unknown, importedValue: unknown): JsonRecord {
  const existing = asRecord(existingValue) ?? {};
  const imported = asRecord(importedValue);
  if (imported === undefined) {
    return { ...existing };
  }
  const merged: JsonRecord = { ...existing };
  for (const [key, value] of Object.entries(imported)) {
    if (key === "uuid" && typeof merged.uuid === "string" && merged.uuid.length > 0) {
      continue;
    }
    const existingChild = asRecord(merged[key]);
    const importedChild = asRecord(value);
    merged[key] = existingChild !== undefined && importedChild !== undefined
      ? deepMergePreservingExistingUuids(existingChild, importedChild)
      : structuredClone(value);
  }
  return merged;
}

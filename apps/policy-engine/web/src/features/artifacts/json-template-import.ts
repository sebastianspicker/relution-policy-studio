/** Validates local JSON fragments before merging them into configuration details. */
import { asRecord } from "../../shared/editor-record-utils.js";
import type { JsonRecord } from "../../shared/editor-contracts.js";
import { deepMergePreservingExistingUuids } from "../../../../src/browser/json.js";

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

/** Merges an import without replacing existing UUIDs that bind related policy artifacts. */
export function mergeSettingDetails(existingDetails: JsonRecord, importedDetails: JsonRecord): JsonRecord {
  if (typeof existingDetails.type === "string" && typeof importedDetails.type === "string" && existingDetails.type !== importedDetails.type) {
    throw new Error(`Setting JSON type ${importedDetails.type} does not match selected setting type ${existingDetails.type}`);
  }
  return deepMergePreservingExistingUuids(existingDetails, importedDetails);
}

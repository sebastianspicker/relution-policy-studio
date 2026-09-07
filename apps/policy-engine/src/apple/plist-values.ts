/** Converts JSON-like values to safe plist value records. */
import { isPlistDataValue, isRecord, type PlistValue } from "./plist-types.js";

export function plistValueFromUnknown(value: unknown): PlistValue {
  if (isPlistDataValue(value)) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(plistValueFromUnknown);
  if (isRecord(value)) return plistRecordFromEntries(Object.entries(value));
  return "";
}

export function jsonPayloadKeys(record: Record<string, unknown>): Record<string, PlistValue> {
  return plistRecordFromEntries(Object.entries(record));
}

function plistRecordFromEntries(entries: Array<[string, unknown]>): Record<string, PlistValue> {
  const output = Object.create(null) as Record<string, PlistValue>;
  for (const [key, value] of entries) output[key] = plistValueFromUnknown(value);
  return output;
}

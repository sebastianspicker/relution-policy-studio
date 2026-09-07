/** Parses key-value editor fields while preserving delimiter-containing values. */
import type { JsonRecord } from "./apple-compat-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function keyValueRecord(value: unknown): JsonRecord {
  const record = asRecord(value);
  if (record !== undefined) return Object.fromEntries(Object.entries(record)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, entry]) => [key, typeof entry === "string" ? entry : String(entry ?? "")]));
  if (typeof value !== "string") return {};
  const output: JsonRecord = {};
  for (const line of value.split(/\r?\n/u)) {
    const separator = line.includes(":") ? ":" : "=";
    const [rawKey, ...rawValue] = line.split(separator);
    const key = rawKey?.trim() ?? "";
    if (key.length > 0) output[key] = rawValue.join(separator).trim();
  }
  return output;
}

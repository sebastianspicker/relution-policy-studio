/** Parses primitive and shared editor API request fields. */
import { badRequest, type JsonRecord } from "./editor-http-error.js";

export function requireString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`Expected string body field: ${key}`);
  }
  return value;
}

/** Returns undefined only for an absent field; present values must be strings. */
export function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw badRequest(`Expected string body field: ${key}`);
  return value;
}

/** Returns undefined only for an absent field; present values must be objects. */
export function optionalRecord(record: JsonRecord, key: string): JsonRecord | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(`Expected object body field: ${key}`);
  }
  return value as JsonRecord;
}

export function requireNumber(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw badRequest(`Expected safe integer body field: ${key}`);
  }
  return value;
}

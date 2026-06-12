import { asRecord, type JsonRecord } from "./utils/json-guards.js";

const PAYLOAD_SHELL_KEYS = new Set(["PayloadDisplayName", "PayloadIdentifier", "PayloadType", "PayloadUUID", "PayloadVersion"]);

export function parsePayloadKeysJson(value: unknown, label = "payload keys"): JsonRecord {
  const text = typeof value === "string" ? value : "{}";
  return parseJsonRecordWithContext(text, label, "JSON must be an object");
}

export function parsePayloadBodyJson(value: string, label = "Payload JSON"): JsonRecord {
  return omitPayloadShell(parseJsonRecordWithContext(value.length === 0 ? "{}" : value, label, "must be an object"));
}

export function omitPayloadShell(record: JsonRecord): JsonRecord {
  return recordWithoutKeys(record, PAYLOAD_SHELL_KEYS);
}

export function unknownPayloadOverrides(record: JsonRecord, knownKeys: Set<string>): JsonRecord {
  return recordWithoutKeys(record, knownKeys);
}

export function tryParsePayloadKeysJson(value: unknown): JsonRecord | undefined {
  try {
    return parsePayloadKeysJson(value);
  } catch {
    return undefined;
  }
}

function recordWithoutKeys(record: JsonRecord, excludedKeys: Set<string>): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !excludedKeys.has(key)));
}

function parseJsonRecordWithContext(text: string, label: string, objectError: string): JsonRecord {
  const record = asRecord(parseJsonWithContext(text, label));
  if (record === undefined) {
    throw new Error(`${label} ${objectError}`);
  }
  return record;
}

function parseJsonWithContext(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${label} JSON: ${message}`);
  }
}

/** Validates the bounded, canonical ZIP surface accepted as a REXP archive. */
import { asRecord } from "../platform/serialization/json-guards.js";
import { isPolicyPath } from "../workspace/policy-path.js";
import { decryptRelutionPayload, parseJson } from "./rexp-crypto.js";
import { METADATA_BIN, METADATA_JSON, REPORT_JSON } from "./rexp-format.js";
import type { ZipEntry } from "./zip.js";

export function getRequiredEntry(entries: ZipEntry[], name: string): ZipEntry {
  const entry = entries.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`Missing required archive entry: ${name}`);
  return entry;
}

export function policyEntries(entries: ZipEntry[]): ZipEntry[] {
  return entries.filter((entry) => isPolicyPath(entry.name));
}

export function decryptHashMap(entries: ZipEntry[], password: string): Record<string, string> {
  const parsed = parseJson(decryptRelutionPayload(getRequiredEntry(entries, METADATA_BIN).data, password), METADATA_BIN);
  if (!isStringRecord(parsed)) throw new Error("Decrypted metadata.bin is not a string map");
  return parsed;
}

export function validateArchiveJson(entries: ZipEntry[], password?: string): void {
  parseJson(getRequiredEntry(entries, METADATA_JSON).data, METADATA_JSON);
  parseJson(getRequiredEntry(entries, REPORT_JSON).data, REPORT_JSON);
  if (password !== undefined) for (const entry of policyEntries(entries)) parseJson(decryptRelutionPayload(entry.data, password), entry.name);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  const record = asRecord(value);
  return record !== undefined && Object.values(record).every((entry) => typeof entry === "string");
}

/** Provides small JSON-record helpers for the editor's sidecar and header fields. */
import type { AppleSchemaCatalog } from "../../../src/browser/apple.js";
import { createAppleSchemaCounts } from "../../../src/browser/apple.js";
import type { EditorSidecarState } from "../../../src/browser/sidecar.js";
import { asRecord } from "../../../src/browser/json.js";
import type { JsonRecord } from "./editor-contracts.js";

export { asRecord };

export function emptyAppleSchemaCatalog(): AppleSchemaCatalog {
  return {
    version: 1,
    source: { repository: "", revision: "", generatedAt: "" },
    counts: createAppleSchemaCounts([]),
    entries: [],
  };
}

export function isEditorSidecarState(value: unknown): value is EditorSidecarState {
  const record = asRecord(value);
  return record?.version === 1 && Array.isArray(record.mobileConfigRestore);
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (text.trim().length === 0) {
    throw new Error(`Expected JSON from ${response.url}, got empty response`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.slice(0, 160).replace(/\s+/gu, " ").trim();
    throw new Error(`Expected JSON from ${response.url}, got ${preview || "empty response"}`);
  }
}

type KeyValueEntry = { key: string; value: string };

export function keyValueEntries(value: unknown): KeyValueEntry[] {
  const record = asRecord(value);
  if (record === undefined) {
    return [];
  }
  return Object.entries(record).map(([key, entry]) => ({ key, value: typeof entry === "string" ? entry : String(entry ?? "") }));
}

export function replaceKeyValueEntry(entries: KeyValueEntry[], index: number, entry: KeyValueEntry): KeyValueEntry[] {
  return entries.map((candidate, currentIndex) => (currentIndex === index ? entry : candidate));
}

export function entriesToRecord(entries: KeyValueEntry[]): JsonRecord {
  const record: JsonRecord = {};
  for (const entry of entries) {
    const key = entry.key.trim();
    if (key.length > 0) {
      record[key] = entry.value;
    }
  }
  return record;
}

export function nextHeaderName(entries: KeyValueEntry[]): string {
  const used = new Set(entries.map((entry) => entry.key));
  let index = 1;
  while (used.has(`Header-${index}`)) {
    index += 1;
  }
  return `Header-${index}`;
}

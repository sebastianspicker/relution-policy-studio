/** Converts schema-field values into the editor's safe, displayable forms. */
import type { JsonRecord } from "./editor-contracts.js";
import { asRecord } from "../../../src/browser/json.js";

export function textAreaValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").join("\n");
  }
  return typeof value === "string" ? value : String(value ?? "");
}

export function objectListRows(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => asRecord(entry) ?? {});
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(""));
}

export function parseIntegerValue(value: unknown): number | undefined {
  const trimmed = String(value).trim();
  if (!/^-?\d+$/u.test(trimmed)) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

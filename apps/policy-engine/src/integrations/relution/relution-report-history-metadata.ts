/** Bounded, descriptor-based JSON report metadata parsing. */
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { assertSafeReportFile, MAX_REPORT_HISTORY_JSON_BYTES } from "./relution-report-storage.js";

export function reportJsonMetadata(jsonFile: string, jsonName: string): { sizeBytes: number; modifiedAt: string; generatedAt?: string } {
  const descriptor = openReadOnlyReport(jsonFile, jsonName);
  try {
    const stats = fstatSync(descriptor);
    assertSafeReportFile(stats, jsonName);
    const metadata = { sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString() };
    return stats.size > MAX_REPORT_HISTORY_JSON_BYTES ? metadata : reportMetadataFromContents(descriptor, metadata);
  } finally {
    closeSync(descriptor);
  }
}

function openReadOnlyReport(jsonFile: string, jsonName: string): number {
  try {
    return openSync(jsonFile, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ELOOP") {
      throw new Error(`Unsafe Relution report path: ${jsonName}`, { cause: error });
    }
    throw error;
  }
}

function reportMetadataFromContents(descriptor: number, metadata: { sizeBytes: number; modifiedAt: string }): { sizeBytes: number; modifiedAt: string; generatedAt?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(descriptor, "utf8")) as unknown;
  } catch {
    return metadata;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("generatedAt" in parsed)) return metadata;
  const generatedAt = parsed.generatedAt;
  if (typeof generatedAt !== "string") return metadata;
  const milliseconds = Date.parse(generatedAt);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === generatedAt ? { ...metadata, generatedAt } : metadata;
}

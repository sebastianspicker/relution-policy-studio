/** Bounded, fail-closed report metadata collection. */
import { readdirSync } from "node:fs";
import { basename } from "node:path";
import { lstatIfPresent } from "../../platform/filesystem/filesystem.js";
import { reportJsonMetadata } from "./relution-report-history-metadata.js";
import { assertSafeReportFile, isRelutionReportFile, reportFile, workspaceRelativeReportPath, type RelutionReportHistoryEntry } from "./relution-report-storage.js";

export function readRelutionReportHistory(workspaceRoot: string, reportDir: string): RelutionReportHistoryEntry[] {
  return readdirSync(reportDir)
    .filter((name) => isRelutionReportFile(name, "json"))
    .map((name) => reportHistoryEntry(workspaceRoot, reportDir, name))
    .filter((entry) => entry.markdownPath !== undefined)
    .sort(compareHistoryEntries);
}

function reportHistoryEntry(workspaceRoot: string, reportDir: string, jsonName: string): RelutionReportHistoryEntry {
  const jsonFile = reportFile(reportDir, jsonName);
  const jsonMetadata = reportJsonMetadata(jsonFile, jsonName);
  const markdownName = jsonName.replace(/\.json$/u, ".md");
  const markdownFile = reportFile(reportDir, markdownName);
  const entry: RelutionReportHistoryEntry = {
    jsonPath: workspaceRelativeReportPath(workspaceRoot, jsonFile),
    sizeBytes: jsonMetadata.sizeBytes,
    generatedAt: jsonMetadata.generatedAt ?? jsonMetadata.modifiedAt,
  };
  const markdownStats = lstatIfPresent(markdownFile);
  if (markdownStats !== undefined) {
    assertSafeReportFile(markdownStats, markdownName);
    entry.markdownPath = workspaceRelativeReportPath(workspaceRoot, markdownFile);
  }
  return entry;
}

function compareHistoryEntries(a: RelutionReportHistoryEntry, b: RelutionReportHistoryEntry): number {
  const byGeneratedAt = (b.generatedAt ?? "").localeCompare(a.generatedAt ?? "");
  return byGeneratedAt === 0 ? basename(b.jsonPath).localeCompare(basename(a.jsonPath)) : byGeneratedAt;
}

/** Incomplete-pair cleanup and retained-history pruning. */
import { lstatSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { readRelutionReportHistory } from "./relution-report-history.js";
import { removeReportFile } from "./relution-report-writing.js";
import { assertSafeReportFile, isRelutionReportFile, MAX_RETAINED_RELUTION_REPORTS, reportFile, STALE_INCOMPLETE_REPORT_MS } from "./relution-report-storage.js";

export function pruneRelutionReportHistory(workspaceRoot: string, reportDir: string, protectedJsonName: string): void {
  removeIncompleteReportPairs(reportDir);
  const completeReports = readRelutionReportHistory(workspaceRoot, reportDir);
  const protectedExists = completeReports.some((entry) => basename(entry.jsonPath) === protectedJsonName);
  const retainedOtherCount = MAX_RETAINED_RELUTION_REPORTS - (protectedExists ? 1 : 0);
  const removable = completeReports.filter((entry) => basename(entry.jsonPath) !== protectedJsonName);
  for (const entry of removable.slice(retainedOtherCount)) removeReportPair(reportDir, entry.jsonPath, entry.markdownPath);
}

export function removeIncompleteReportPairs(reportDir: string): void {
  const names = readdirSync(reportDir);
  const nameSet = new Set(names);
  for (const name of names) removeIncompleteReportFile(reportDir, name, nameSet);
}

function removeIncompleteReportFile(reportDir: string, name: string, nameSet: ReadonlySet<string>): void {
  const path = reportFile(reportDir, name);
  if (isTemporaryReportFile(name)) return removeStaleIncompleteFile(path, name);
  const extension = reportExtension(name);
  if (extension === undefined || nameSet.has(reportCompanion(name, extension))) return;
  removeStaleIncompleteFile(path, name);
}

function reportExtension(name: string): "json" | "md" | undefined {
  if (isRelutionReportFile(name, "json")) return "json";
  return isRelutionReportFile(name, "md") ? "md" : undefined;
}

function reportCompanion(name: string, extension: "json" | "md"): string {
  return extension === "json" ? name.replace(/\.json$/u, ".md") : name.replace(/\.md$/u, ".json");
}

function isTemporaryReportFile(name: string): boolean {
  return /^\.relution-compliance-report-[0-9a-f-]+\.(?:json|md)\.[0-9a-f-]+\.tmp$/u.test(name);
}

function removeStaleIncompleteFile(path: string, name: string): void {
  const stats = lstatSync(path);
  assertSafeReportFile(stats, name);
  if (Date.now() - stats.mtimeMs >= STALE_INCOMPLETE_REPORT_MS) removeReportFile(path);
}

function removeReportPair(reportDir: string, jsonPath: string, markdownPath: string | undefined): void {
  removeReportFile(reportFile(reportDir, basename(jsonPath)));
  removeReportFile(reportFile(reportDir, basename(markdownPath ?? "")));
}

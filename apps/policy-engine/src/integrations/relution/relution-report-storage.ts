/** Shared report filename policy, path containment, and history contracts. */
import type { Stats } from "node:fs";
import { join, relative } from "node:path";

export const MAX_RETAINED_RELUTION_REPORTS = 10;
export const STALE_INCOMPLETE_REPORT_MS = 5 * 60 * 1_000;
export const MAX_REPORT_HISTORY_JSON_BYTES = 16 * 1024 * 1024;
const RELUTION_REPORT_FILE_NAME = /^relution-compliance-report-(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.(json|md)$/u;

export interface RelutionReportPaths {
  /** Path relative to the workspace root. */
  jsonPath: string;
  /** Path relative to the workspace root. */
  markdownPath: string;
}

export interface RelutionReportHistoryEntry {
  jsonPath: string;
  markdownPath?: string;
  generatedAt?: string;
  sizeBytes: number;
}

export function isRelutionReportFile(name: string, extension: "json" | "md"): boolean {
  return RELUTION_REPORT_FILE_NAME.exec(name)?.[1] === extension;
}

export function reportFile(reportDir: string, name: string): string {
  const path = join(reportDir, name);
  if (relative(reportDir, path) !== name) throw new Error("Relution report path escaped the report directory");
  return path;
}

export function workspaceRelativeReportPath(workspaceRoot: string, reportPath: string): string {
  const reportRelativePath = relative(workspaceRoot, reportPath);
  if (reportRelativePath.length === 0 || reportRelativePath.startsWith("..") || reportRelativePath === "reports") {
    throw new Error("Relution report path escaped the workspace");
  }
  return reportRelativePath;
}

export function assertSafeReportFile(stats: Stats, name: string): void {
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Unsafe Relution report path: ${name}`);
}

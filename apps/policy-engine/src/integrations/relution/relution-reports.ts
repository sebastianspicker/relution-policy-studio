/** Writes private report pairs with atomic per-file publication and incomplete-pair cleanup. */
import { randomUUID } from "node:crypto";
import { renameSync } from "node:fs";
import { join } from "node:path";
import type { RelutionAssessmentReport } from "./relution-api-types.js";
import { readRelutionReportHistory } from "./relution-report-history.js";
import { removeReportFile, secureRelutionReportDir, writePrivateTemporaryFile } from "./relution-report-writing.js";
import { workspaceRelativeReportPath } from "./relution-report-storage.js";
import { renderRelutionMarkdownReport } from "./relution-report-rendering.js";
import { pruneRelutionReportHistory, removeIncompleteReportPairs } from "./relution-report-retention.js";
import { persistedRelutionReport } from "./relution-report-rendering.js";
import type { RelutionReportHistoryEntry, RelutionReportPaths } from "./relution-report-storage.js";
export type { RelutionReportPaths } from "../../contracts/relution-assessment.js";

export type { RelutionReportHistoryEntry } from "./relution-report-storage.js";
export function writeRelutionReport(workspace: string, report: RelutionAssessmentReport): RelutionReportPaths {
  const { workspaceRoot, reportDir } = secureRelutionReportDir(workspace);
  if (reportDir === undefined) throw new Error("Relution report directory is unavailable");
  const reportId = randomUUID();
  const jsonName = `relution-compliance-report-${reportId}.json`;
  const markdownName = `relution-compliance-report-${reportId}.md`;
  const jsonFile = join(reportDir, jsonName);
  const markdownFile = join(reportDir, markdownName);
  let jsonTemporary: string | undefined;
  let markdownTemporary: string | undefined;
  try {
    jsonTemporary = writePrivateTemporaryFile(reportDir, jsonName, `${JSON.stringify(persistedRelutionReport(report), null, 2)}\n`);
    markdownTemporary = writePrivateTemporaryFile(reportDir, markdownName, renderRelutionMarkdownReport(report));
    renameSync(markdownTemporary, markdownFile);
    markdownTemporary = undefined;
    renameSync(jsonTemporary, jsonFile);
    jsonTemporary = undefined;
    pruneRelutionReportHistory(workspaceRoot, reportDir, jsonName);
  } catch (error) {
    if (jsonTemporary !== undefined) removeReportFile(jsonTemporary);
    if (markdownTemporary !== undefined) removeReportFile(markdownTemporary);
    removeReportFile(jsonFile);
    removeReportFile(markdownFile);
    throw error;
  }
  return {
    jsonPath: workspaceRelativeReportPath(workspaceRoot, jsonFile),
    markdownPath: workspaceRelativeReportPath(workspaceRoot, markdownFile),
  };
}

export function listRelutionReports(workspace: string): RelutionReportHistoryEntry[] {
  const { workspaceRoot, reportDir } = secureRelutionReportDir(workspace, false);
  if (reportDir === undefined) return [];
  removeIncompleteReportPairs(reportDir);
  return readRelutionReportHistory(workspaceRoot, reportDir);
}

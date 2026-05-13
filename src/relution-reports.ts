import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RelutionAssessmentReport } from "./relution-api.js";

export interface RelutionReportPaths {
  jsonPath: string;
  markdownPath: string;
}

export interface RelutionReportHistoryEntry {
  jsonPath: string;
  markdownPath?: string;
  generatedAt?: string;
  sizeBytes: number;
}

export function writeRelutionReport(workspace: string, report: RelutionAssessmentReport): RelutionReportPaths {
  const reportDir = relutionReportDir(workspace);
  mkdirSync(reportDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/gu, "-");
  const jsonPath = join(reportDir, `relution-compliance-report-${stamp}.json`);
  const markdownPath = join(reportDir, `relution-compliance-report-${stamp}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, renderRelutionMarkdownReport(report));
  return { jsonPath, markdownPath };
}

export function listRelutionReports(workspace: string): RelutionReportHistoryEntry[] {
  const reportDir = relutionReportDir(workspace);
  if (!existsSync(reportDir)) {
    return [];
  }
  return readdirSync(reportDir)
    .filter((name) => /^relution-compliance-report-.+\.json$/u.test(name))
    .map((name) => {
      const jsonPath = join(reportDir, name);
      const markdownPath = join(reportDir, name.replace(/\.json$/u, ".md"));
      const stats = statSync(jsonPath);
      const entry: RelutionReportHistoryEntry = {
        jsonPath,
        sizeBytes: stats.size,
        generatedAt: stats.mtime.toISOString(),
      };
      if (existsSync(markdownPath)) {
        entry.markdownPath = markdownPath;
      }
      return entry;
    })
    .sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""));
}

export function renderRelutionMarkdownReport(report: RelutionAssessmentReport): string {
  const lines = [
    "# Relution Compliance Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Server: ${report.baseUrl}`,
    "",
    "## Summary",
    "",
    `- Devices: ${String(report.summary.totalDevices)}`,
    `- Compliant: ${String(report.summary.compliant)}`,
    `- Issues: ${String(report.summary.issue)}`,
    `- Not checkable: ${String(report.summary.notCheckable)}`,
    "",
    "## Device Findings",
    "",
  ];
  for (const entry of report.devices) {
    lines.push(`### ${entry.device.name}`, "");
    lines.push(`- Status: ${entry.status}`);
    lines.push(`- Platform: ${entry.device.platform ?? "unknown"}`);
    lines.push(`- Device status: ${entry.device.status ?? "unknown"}`);
    lines.push(`- Policy status: ${entry.device.policyStatus ?? "unknown"}`);
    if (entry.issues.length === 0) {
      lines.push("- Issues: none");
    } else {
      for (const issue of entry.issues) {
        lines.push(`- ${issue.id}: ${issue.severity}: ${issue.message}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function relutionReportDir(workspace: string): string {
  return join(workspace, "reports");
}

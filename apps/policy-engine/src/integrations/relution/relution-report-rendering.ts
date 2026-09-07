/** Redacts persisted report data and renders the operator-safe markdown view. */
import type { RelutionAssessmentReport } from "./relution-api-types.js";

export function renderRelutionMarkdownReport(report: RelutionAssessmentReport): string {
  const lines = reportHeader(report);
  for (const entry of report.devices) appendDeviceFindings(lines, entry);
  return `${lines.join("\n")}\n`;
}

export function persistedRelutionReport(report: RelutionAssessmentReport): Omit<RelutionAssessmentReport, "devices"> & { devices: Array<Omit<RelutionAssessmentReport["devices"][number], "device"> & { device: Omit<RelutionAssessmentReport["devices"][number]["device"], "raw" | "serialNumber" | "userName" | "userEmail"> }> } {
  return {
    ...report,
    baseUrl: "[redacted]",
    devices: report.devices.map(({ device, ...assessment }) => {
      const { raw: _raw, serialNumber: _serialNumber, userName: _userName, userEmail: _userEmail, ...persistedDevice } = device;
      return { ...assessment, device: persistedDevice };
    }),
  };
}

function reportHeader(report: RelutionAssessmentReport): string[] {
  const assessedTotal = report.completeness.total === undefined ? "" : ` of ${String(report.completeness.total)}`;
  return [
    "# Relution Compliance Report", "", `Generated: ${report.generatedAt}`, "Server: [redacted]", "", "## Summary", "",
    `- Devices: ${String(report.summary.totalDevices)}`,
    `- Assessed: ${String(report.completeness.assessedCount)}${assessedTotal}`,
    `- Coverage: ${report.completeness.status}`,
    `- Compliant: ${String(report.summary.compliant)}`,
    `- Issues: ${String(report.summary.issue)}`,
    `- Not checkable: ${String(report.summary.notCheckable)}`,
    "", "## Device Findings", "",
  ];
}

function appendDeviceFindings(lines: string[], entry: RelutionAssessmentReport["devices"][number]): void {
  lines.push(`### ${markdownText(entry.device.name)}`, "");
  lines.push(`- Status: ${entry.status}`);
  lines.push(`- Platform: ${markdownText(entry.device.platform ?? "unknown")}`);
  lines.push(`- Device status: ${markdownText(entry.device.status ?? "unknown")}`);
  lines.push(`- Policy status: ${markdownText(entry.device.policyStatus ?? "unknown")}`);
  if (entry.issues.length === 0) lines.push("- Issues: none");
  else for (const issue of entry.issues) lines.push(`- ${issue.id}: ${issue.severity}: ${markdownText(issue.message)}`);
  lines.push("");
}

function markdownText(value: string): string {
  return value.replace(/[\r\n]+/gu, " ").replace(/[\\`*_{}[\]<>()#+.!|>-]/gu, "\\$&");
}

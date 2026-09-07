/** Renders an audit report as stable Markdown tables and summaries. */
import type { RelutionAuditReport } from "./audit-types.js";
import { mockResultOk } from "./audit-roundtrip.js";
import { mockRoundtripSummary } from "./audit-summary.js";

export function renderAuditMarkdown(report: RelutionAuditReport): string {
  const lines = auditMarkdownHeader(report);
  appendCompatibilitySection(lines, report);
  appendRoundtripSection(lines, report);
  appendSampleSection(lines, report);
  lines.push("## Parameter Matrix", "");
  lines.push("The complete per-configuration field matrix is stored in the JSON audit report under `configurationTypes[].fields`.", "");
  return `${lines.join("\n")}\n`;
}

function auditMarkdownHeader(report: RelutionAuditReport): string[] {
  return [
    "# Relution Configuration Audit", "", `Generated: ${report.generatedAt}`,
    `Server version: ${report.server.version}`, `Template source: ${report.server.sourceImage}`, "",
    "## Summary", "", `- Platforms: ${report.summary.platformCount}`,
    `- Configuration types: ${report.summary.configurationTypeCount}`,
    `- OpenAPI schemas: ${report.summary.schemaCount}`,
    `- Spring metadata: ${report.summary.springGroupCount} groups, ${report.summary.springPropertyCount} properties`,
    `- Fields: ${report.summary.fieldCount} total, ${report.summary.primitiveFieldCount} primitive, ${report.summary.objectFieldCount} object, ${report.summary.arrayFieldCount} array`,
    `- Enum fields: ${report.summary.enumFieldCount}`,
    `- Fields with descriptions: ${report.summary.describedFieldCount}`,
    `- Referenced fields: ${report.summary.refFieldCount}`,
    `- Schema compatibility issues recorded: ${report.summary.schemaCompatibilityIssueCount}`,
    `- ${mockRoundtripSummary(report)}`, "",
    "## Platform Matrix", "", "| Platform | Configuration types |", "| --- | ---: |",
    ...report.platforms.map((entry) => `| ${entry.platform} | ${entry.configurationTypeCount} |`), "",
    "## Schema Compatibility", "",
  ];
}

function appendCompatibilitySection(lines: string[], report: RelutionAuditReport): void {
  if (report.schemaCompatibilityIssues.length === 0) {
    lines.push("No schema compatibility issues were recorded.", "");
    return;
  }
  lines.push("| Schema | Path | Issue |", "| --- | --- | --- |");
  for (const issue of report.schemaCompatibilityIssues) {
    lines.push(`| ${issue.schemaName} | ${issue.path} | ${escapeMarkdown(issue.message)} |`);
  }
  lines.push("");
}

function appendRoundtripSection(lines: string[], report: RelutionAuditReport): void {
  lines.push("## Mock Roundtrip", "");
  const failures = report.mockRoundtrip.filter((result) => !mockResultOk(result));
  if (failures.length === 0) {
    lines.push("All configuration templates validated, packed, verified, extracted, and preserved their `details.type`.", "");
    return;
  }
  lines.push("| Type | Platform | Errors |", "| --- | --- | --- |");
  for (const failure of failures) {
    lines.push(`| ${failure.type} | ${failure.platform} | ${escapeMarkdown(failure.errors.join("; "))} |`);
  }
  lines.push("");
}

function appendSampleSection(lines: string[], report: RelutionAuditReport): void {
  if (report.sampleExport === undefined) return;
  lines.push("## Sample Export", "", `- Path: ${report.sampleExport.path}`);
  lines.push(`- Hash verification: ${report.sampleExport.verifyOk ? "PASS" : "FAIL"}`);
  lines.push(`- Local schema validation: ${report.sampleExport.validationOk ? "PASS" : "FAIL"}`);
  if (report.sampleExport.validationErrors.length > 0) {
    lines.push("", "| Path | Error |", "| --- | --- |");
    for (const error of report.sampleExport.validationErrors) {
      lines.push(`| ${error.path} | ${escapeMarkdown(error.message)} |`);
    }
  }
  lines.push("");
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

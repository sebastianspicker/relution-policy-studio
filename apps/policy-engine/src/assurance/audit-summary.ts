/** Formats audit summary facts consistently across human-readable outputs. */
import type { RelutionAuditReport } from "./audit-types.js";

export function mockRoundtripSummary(report: RelutionAuditReport): string {
  return `Mock roundtrip: ${String(report.summary.mockRoundtripPassed)} passed, ${String(report.summary.mockRoundtripFailed)} failed`;
}

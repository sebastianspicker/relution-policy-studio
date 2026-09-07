/** Implements the offline Relution audit command. */
import { existsSync } from "node:fs";
import { createRelutionAuditReport } from "../assurance/audit-report.js";
import { writeAuditOutputs } from "../assurance/audit-output.js";
import { mockRoundtripSummary } from "../assurance/audit-summary.js";
import type { ParsedArgs } from "./contracts.js";
import { optionalString } from "./cli-arg-values.js";
import { logWrittenPaths, optionalEnvRexpKey, printJson } from "./cli-runtime.js";
import { loadTemplateBundle } from "../assurance/template-bundle.js";

export const DEFAULT_AUDIT_MARKDOWN_OUT = "reports/relution-audit.md";

export function auditCommand(args: ParsedArgs): void {
  const bundle = loadTemplateBundle(optionalString(args, "bundle"));
  const key = optionalString(args, "key") ?? optionalEnvRexpKey() ?? "key123";
  const defaultSample = "example/sample-policy-export.rexp";
  const sampleRexp = optionalString(args, "sample") ?? (existsSync(defaultSample) ? defaultSample : undefined);
  const auditOptions: Parameters<typeof createRelutionAuditReport>[0] = { bundle, key };
  if (sampleRexp !== undefined) auditOptions.sampleRexp = sampleRexp;
  const report = createRelutionAuditReport(auditOptions);
  const jsonOut = optionalString(args, "json-out") ?? "data/relution-26.1.1/audit-report.json";
  const markdownOut = optionalString(args, "markdown-out") ?? DEFAULT_AUDIT_MARKDOWN_OUT;
  writeAuditOutputs(report, { jsonOut, markdownOut });
  if (args.options.json === true) printJson(report);
  else {
    logWrittenPaths(jsonOut, markdownOut);
    console.log(mockRoundtripSummary(report));
    if (report.sampleExport !== undefined) console.log(`Sample export validation: ${report.sampleExport.validationOk ? "PASS" : "FAIL"}`);
  }
  if (report.summary.mockRoundtripFailed > 0 || report.sampleExport?.validationOk === false) process.exitCode = 1;
}

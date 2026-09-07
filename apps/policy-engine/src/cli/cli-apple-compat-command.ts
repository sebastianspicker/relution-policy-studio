/** Implements Apple compatibility listing and report generation commands. */
import { createAppleCompatReport, renderAppleCompatReportMarkdown } from "../assurance/apple-compat-report.js";
import type { ParsedArgs } from "./contracts.js";
import { optionalString, requirePositional } from "./cli-arg-values.js";
import { logWrittenPaths, printJson, writeJson, writeText } from "./cli-runtime.js";
import { loadTemplateBundle } from "../assurance/template-bundle.js";

export function appleCompatCommand(args: ParsedArgs): void {
  const action = requirePositional(args, 0, "apple-compat requires an action: list or audit");
  const report = createAppleCompatReport(loadTemplateBundle(optionalString(args, "bundle")));
  if (action === "list") return listAppleCompatibility(args, report);
  if (action === "audit") return auditAppleCompatibility(args, report);
  throw new Error(`Unknown apple-compat action: ${action}`);
}

function listAppleCompatibility(args: ParsedArgs, report: ReturnType<typeof createAppleCompatReport>): void {
  if (args.options.json === true) return printJson(report);
  for (const setting of report.settings) {
    const mark = setting.status === "mobileconfig-backed" ? "*" : "";
    console.log(`${setting.label}${mark} -> ${setting.payloadType} [${setting.platforms.join(",")}]`);
  }
  console.log(`Mobileconfig-backed: ${report.summary.mobileconfigBacked}`);
}

function auditAppleCompatibility(args: ParsedArgs, report: ReturnType<typeof createAppleCompatReport>): void {
  const jsonOut = optionalString(args, "json-out") ?? "data/apple-compat/relution-jamf-gap.json";
  const markdownOut = optionalString(args, "markdown-out") ?? "docs/JAMF_RELUTION_APPLE_GAP.md";
  writeJson(jsonOut, report);
  writeText(markdownOut, renderAppleCompatReportMarkdown(report));
  if (args.options.json === true) return printJson(report);
  logWrittenPaths(jsonOut, markdownOut);
}

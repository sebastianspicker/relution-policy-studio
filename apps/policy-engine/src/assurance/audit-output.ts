/** Writes JSON and Markdown audit artifacts, creating parent directories. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditOutputOptions, RelutionAuditReport } from "./audit-types.js";
import { renderAuditMarkdown } from "./audit-markdown.js";

export function writeAuditOutputs(report: RelutionAuditReport, options: AuditOutputOptions): void {
  if (options.jsonOut !== undefined) writeTextFile(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  if (options.markdownOut !== undefined) writeTextFile(options.markdownOut, renderAuditMarkdown(report));
}

function writeTextFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

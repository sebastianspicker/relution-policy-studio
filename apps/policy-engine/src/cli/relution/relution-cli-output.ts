/** Formats Relution command output and completeness warnings. */
import { resolve } from "node:path";
import type { RelutionDeviceQueryResult } from "../../integrations/relution/relution-api-types.js";
import type { RelutionCliArgs } from "./relution-cli-options.js";

export function absoluteReportPaths(
  workspace: string,
  files: { jsonPath: string; markdownPath: string },
): { jsonPath: string; markdownPath: string } {
  return {
    jsonPath: resolve(workspace, files.jsonPath),
    markdownPath: resolve(workspace, files.markdownPath),
  };
}

export function printReportPaths(workspace: string, files: { jsonPath: string; markdownPath: string }): void {
  console.log(`Report JSON: ${resolve(workspace, files.jsonPath)}`);
  console.log(`Report Markdown: ${resolve(workspace, files.markdownPath)}`);
}

export function warnIfDeviceQueryIncomplete(result: RelutionDeviceQueryResult): void {
  if (result.total === undefined) {
    console.error(`Warning: assessed ${String(result.count)} enrolled devices, but the server did not report the total; compliance coverage is unknown.`);
    return;
  }
  if (result.truncated) {
    console.error(`Warning: showing ${String(result.count)} of ${String(result.total)} enrolled devices; compliance results are incomplete.`);
  }
}

export function printResult(args: RelutionCliArgs, value: unknown, output: string): void {
  if (args.options.json === true) {
    printJson(value);
    return;
  }
  console.log(output);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

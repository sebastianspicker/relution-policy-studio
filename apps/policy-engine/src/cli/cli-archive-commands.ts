/** Implements archive inspection, verification, extraction, and packing commands. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedArgs } from "./contracts.js";
import { optionalString, requirePositional, requireString } from "./cli-arg-values.js";
import { optionalEnvRexpKey, printJson, requireKey, requireNewArchiveKey } from "./cli-runtime.js";
import { extractRexp } from "../archive/rexp-extraction.js";
import { inspectRexp, verifyRexp } from "../archive/rexp-inspection.js";
import { packPlainDirectory } from "../archive/rexp-packing.js";

export function inspectCommand(args: ParsedArgs): void {
  const file = requirePositional(args, 0, "inspect requires a .rexp file");
  const key = optionalString(args, "key") ?? optionalEnvRexpKey();
  const result = inspectRexp(file, key);
  if (args.options.json === true) {
    printJson(result);
    return;
  }
  console.log(`Archive: ${file}`);
  console.log(`Policy entries: ${result.policyEntries.length}`);
  console.log(`Metadata: ${JSON.stringify(result.metadata)}`);
  console.log(`Report: ${JSON.stringify(result.report)}`);
  if (result.policies !== undefined) {
    console.log("Decrypted policies:");
    for (const policy of result.policies) {
      const hashState = policy.hashStatus === "match" ? "hash ok" : policy.hashStatus === "absent" ? "hash absent" : "hash mismatch";
      console.log(`- ${policy.path}: ${policy.name ?? "(unnamed)"} (${policy.uuid ?? "no uuid"}, ${policy.platform ?? "no platform"}, ${policy.configurationCount ?? 0} configurations, ${hashState})`);
    }
  }
}

export function verifyCommand(args: ParsedArgs): void {
  const file = requirePositional(args, 0, "verify requires a .rexp file");
  const result = verifyRexp(file, requireKey(args));
  if (args.options.json === true) {
    printJson(result);
    return;
  }
  for (const entry of result.checkedEntries) {
    const state = entry.hashStatus === "match" ? "PASS" : "FAIL";
    console.log(`${state} ${entry.path}${entry.hashStatus === "match" ? "" : ` (${entry.hashStatus})`}`);
  }
  console.log(result.ok ? "VERDICT: PASS" : "VERDICT: FAIL");
  if (!result.ok) process.exitCode = 1;
}

export function extractCommand(args: ParsedArgs): void {
  const file = requirePositional(args, 0, "extract requires a .rexp file");
  const out = requireString(args, "out", "extract requires --out <dir>");
  extractRexp(file, out, requireKey(args), { force: args.options.force === true, pretty: args.options.pretty === true });
  console.log(`Extracted ${file} to ${out}`);
}

export function packCommand(args: ParsedArgs): void {
  const inputDir = requirePositional(args, 0, "pack requires an extracted directory");
  const out = requireString(args, "out", "pack requires --out <file.rexp>");
  if (!existsSync(inputDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
  packPlainDirectory(inputDir, out, requireNewArchiveKey(args), { force: args.options.force === true });
  console.log(`Wrote ${resolve(out)}`);
}

/** Implements CLI commands for deterministic MDM artifact generation. */
import { diffMdm, generateMdm, readGeneratedManifest } from "../mdm/mdm-generator.js";
import { validateMdm, verifyMdmSources } from "../mdm/mdm-validation.js";

interface MdmCliArgs { positionals: string[]; options: Record<string, string | boolean> }

export function runMdmCliCommand(args: MdmCliArgs): void {
  const action = args.positionals[0];
  const json = args.options.json === true;
  if (action === "verify-sources") {
    const issues = verifyMdmSources();
    emit({ ok: issues.length === 0, issues }, json);
    if (issues.length > 0) throw new Error(`MDM source verification failed with ${issues.length} issue(s)`);
    return;
  }
  if (action === "validate") {
    const report = validateMdm();
    emit(report, json);
    if (!report.ok) throw new Error(`MDM validation failed with ${report.issues.filter((issue) => issue.severity === "error").length} error(s)`);
    return;
  }
  if (action === "generate") {
    const manifest = generateMdm();
    emit(manifest, json);
    return;
  }
  if (action === "diff") {
    const report = diffMdm();
    emit(report, json);
    if (!report.ok) throw new Error("Generated MDM artifacts differ from their manifest");
    return;
  }
  if (action === "manifest") {
    emit(readGeneratedManifest(), json);
    return;
  }
  throw new Error("mdm requires an action: verify-sources, validate, generate, diff, or manifest");
}

function emit(value: unknown, json: boolean): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === "object" && value !== null && "ok" in value) console.log(`MDM verdict: ${(value as { ok: boolean }).ok ? "PASS" : "FAIL"}`);
  else console.log(JSON.stringify(value, null, 2));
}

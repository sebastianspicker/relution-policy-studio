/** Verifies sample archives and inspects extracted policy payloads for audit checks. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractRexp } from "../archive/rexp-extraction.js";
import { verifyRexp } from "../archive/rexp-inspection.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import { loadPersistedWorkspace as loadWorkspace } from "../workspace/storage.js";
import { validateWorkspace } from "../workspace/workspace-validation.js";
import type { SampleExportAudit } from "./audit-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { parseJsonFileWithContext } from "../platform/serialization/json-file-parse.js";

export function parseAuditJsonFile(path: string): unknown {
  return parseJsonFileWithContext(path, `audit file ${path}`);
}

export function auditSampleExport(bundle: RelutionTemplateBundle, sampleRexp: string, key: string): SampleExportAudit {
  const verifyOk = verifyRexp(sampleRexp, key).ok;
  if (!verifyOk) return { path: sampleRexp, verifyOk, validationOk: false, validationErrors: [] };
  const root = mkdtempSync(join(tmpdir(), "relution-sample-audit-"));
  extractRexp(sampleRexp, root, key, { force: true, pretty: true });
  const validation = validateWorkspace(loadWorkspace(root), bundle);
  return { path: sampleRexp, verifyOk, validationOk: validation.ok, validationErrors: validation.errors };
}

export function requiredPolicyPath(workspace: { policies: Array<{ path: string }> }): string {
  const policyPath = workspace.policies[0]?.path;
  if (policyPath === undefined) throw new Error("Workspace has no policy");
  return policyPath;
}

export function extractedDetailsType(value: unknown): string | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const versions = Array.isArray(record.versions) ? record.versions : [];
  const firstVersion = asRecord(versions[0]);
  const configurations = Array.isArray(firstVersion?.configurations) ? firstVersion.configurations : [];
  const details = asRecord(asRecord(configurations[0])?.details);
  return typeof details?.type === "string" ? details.type : undefined;
}

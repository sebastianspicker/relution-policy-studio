/** Exercises template and sample archives through the complete local REXP lifecycle. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractRexp } from "../archive/rexp-extraction.js";
import { packPlainDirectory } from "../archive/rexp-packing.js";
import { verifyRexp } from "../archive/rexp-inspection.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../contracts/template.js";
import { addConfigurationToWorkspace } from "../workspace/workspace-configuration-actions.js";
import { createNewWorkspace } from "../workspace/workspace-creation.js";
import { loadPersistedWorkspace as loadWorkspace } from "../workspace/storage.js";
import { validateWorkspace } from "../workspace/workspace-validation.js";
import type { MockRoundtripResult } from "./audit-types.js";
import { extractedDetailsType, parseAuditJsonFile, requiredPolicyPath } from "./audit-archive-inspection.js";

export function runMockRoundtrip(bundle: RelutionTemplateBundle, key: string): MockRoundtripResult[] {
  return bundle.configurationTypes.map((template) => runTemplateRoundtrip(bundle, template, key));
}

function runTemplateRoundtrip(bundle: RelutionTemplateBundle, template: ConfigurationTemplate, key: string): MockRoundtripResult {
  const platform = template.platforms.find((candidate) => candidate !== "UNKNOWN") ?? template.platforms[0] ?? "UNKNOWN";
  const root = mkdtempSync(join(tmpdir(), `relution-audit-${template.type.toLowerCase().replaceAll("_", "-")}-`));
  const out = join(root, "mock.rexp");
  const extracted = join(root, "extracted");
  const result = emptyRoundtripResult(template.type, platform);
  try {
    const workspace = createNewWorkspace({ workspace: root, platform, name: `Mock ${template.type}`, serverVersion: bundle.serverVersion, allowUnknownPlatform: platform === "UNKNOWN" });
    const policyPath = requiredPolicyPath(workspace);
    addConfigurationToWorkspace(root, bundle, { policyPath, versionIndex: 0, type: template.type });
    const validation = validateWorkspace(loadWorkspace(root), bundle);
    result.validationOk = validation.ok;
    if (!validation.ok) {
      result.errors.push(...validation.errors.map((error) => `${error.path}: ${error.message}`));
      return result;
    }
    packPlainDirectory(root, out, key, { force: true });
    result.packOk = true;
    result.verifyOk = verifyRexp(out, key).ok;
    if (!result.verifyOk) {
      result.errors.push("verifyRexp failed");
      return result;
    }
    extractRexp(out, extracted, key, { force: true });
    result.extractOk = true;
    result.detailsTypeOk = extractedDetailsType(parseAuditJsonFile(join(extracted, policyPath))) === template.type;
    if (!result.detailsTypeOk) result.errors.push("details.type mismatch after extract");
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  return result;
}

function emptyRoundtripResult(type: string, platform: string): MockRoundtripResult {
  return { type, platform, validationOk: false, packOk: false, verifyOk: false, extractOk: false, detailsTypeOk: false, errors: [] };
}

export function mockResultOk(result: MockRoundtripResult): boolean {
  return result.validationOk && result.packOk && result.verifyOk && result.extractOk && result.detailsTypeOk;
}

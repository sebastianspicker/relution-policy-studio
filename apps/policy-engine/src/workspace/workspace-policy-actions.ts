/** Adds fully initialized policies and matching report entries. */
import { randomUUID } from "node:crypto";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import { assertSupportedWorkspacePlatform } from "./input-values.js";
import { createWorkspacePolicyEntry, recordPolicyInWorkspaceExportReport } from "./workspace-model.js";
import { WorkspaceInputError } from "./input-values.js";
import type { AddPolicyOptions, AddPolicyResult } from "./types.js";

/** Adds a policy to an already loaded workspace without persisting it. */
export function addPolicyToLoadedWorkspace(workspace: AddPolicyResult["workspace"], bundle: RelutionTemplateBundle, options: AddPolicyOptions): AddPolicyResult {
  if (options.name.trim().length === 0) throw new WorkspaceInputError("Policy name must not be empty");
  assertSupportedWorkspacePlatform(options.platform, { allowed: bundle.platforms });
  const uuid = randomUUID().toUpperCase();
  const name = options.name.trim();
  const policy = createWorkspacePolicyEntry({ uuid, versionUuid: randomUUID().toUpperCase(), now: Date.now(), name, platform: options.platform, description: "" });
  workspace.policies.push(policy);
  recordPolicyInWorkspaceExportReport(workspace.report, { uuid, name });
  return { workspace, policyPath: policy.path };
}

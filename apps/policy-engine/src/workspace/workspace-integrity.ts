/** Checks workspace document and export-report identity before persistence or build. */
import type { PolicyWorkspace, WorkspaceValidationError } from "./types.js";
import { isUnsafeWorkspaceUuid, workspaceString } from "./input-values.js";
import { workspaceReportErrors } from "./workspace-report-integrity.js";

export function workspaceIntegrityErrors(workspace: PolicyWorkspace): WorkspaceValidationError[] {
  const errors = workspace.policies.flatMap(policyIntegrityErrors);
  return [...errors, ...workspaceReportErrors(workspace)];
}

export function assertWorkspaceIntegrity(workspace: PolicyWorkspace): void {
  const error = workspaceIntegrityErrors(workspace)[0];
  if (error !== undefined) throw new Error(`${error.path}: ${error.message}`);
}

function policyIntegrityErrors(policy: PolicyWorkspace["policies"][number]): WorkspaceValidationError[] {
  const uuid = workspaceString(policy.document, "uuid");
  const name = workspaceString(policy.document, "name");
  const errors: WorkspaceValidationError[] = [];
  if (uuid === undefined || isUnsafeWorkspaceUuid(uuid)) errors.push({ path: policy.path, message: "Policy document uuid is missing or unsafe" });
  if (name === undefined || name.trim().length === 0) errors.push({ path: policy.path, message: "Policy document name is missing" });
  if (uuid !== undefined && policy.path !== `policies/policy_${uuid}.json`) errors.push({ path: policy.path, message: "Policy path does not match the document uuid" });
  return errors;
}

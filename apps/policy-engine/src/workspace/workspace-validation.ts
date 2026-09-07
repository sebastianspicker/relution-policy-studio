/** Validates policy workspaces through cached template-schema validators. */
import type { RelutionTemplateBundle } from "../contracts/template.js";
import type { PolicyWorkspace, SchemaCompatibilityIssue, WorkspaceValidationResult } from "./types.js";
import { validateWorkspacePolicy } from "./workspace-configuration-validation.js";
import { getValidatorContext } from "./workspace-schema-context.js";
import { workspaceIntegrityErrors } from "./workspace-integrity.js";

// Template bundles are immutable after loading, so their AJV contexts remain
// cacheable for editor requests without recompiling schemas.
export function validateWorkspace(workspace: PolicyWorkspace, bundle: RelutionTemplateBundle): WorkspaceValidationResult {
  const context = getValidatorContext(bundle);
  const errors = [...workspaceIntegrityErrors(workspace), ...workspace.policies.flatMap((policy) => validateWorkspacePolicy(policy, bundle, context))];
  return {
    ok: errors.length === 0,
    errors,
    schemaCompatibilityIssueCount: context.schemaCompatibilityIssues.length,
    ...(context.schemaCompatibilityIssues.length === 0 ? {} : { schemaCompatibilityIssues: context.schemaCompatibilityIssues }),
  };
}

export function schemaCompatibilityIssues(bundle: RelutionTemplateBundle): SchemaCompatibilityIssue[] {
  return getValidatorContext(bundle).schemaCompatibilityIssues;
}

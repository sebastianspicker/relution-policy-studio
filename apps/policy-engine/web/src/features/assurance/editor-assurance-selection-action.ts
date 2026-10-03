/** Installs only a reviewed assurance result while preserving concurrent local edits. */
import type { AssuranceSelectionApplyRequest, AssuranceSelectionApplyResponse } from "../../../../src/browser/assurance.js";
import type { PolicyWorkspace } from "../../../../src/browser/workspace.js";
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import type { WorkspaceRequestGuard } from "../../shared/editor-workspace-request-guard.js";

interface AssuranceSelectionActionInput {
  readonly requestGuard: WorkspaceRequestGuard;
  readonly workspace: PolicyWorkspace;
  readonly revision: string;
  readonly adopt: (workspace: PolicyWorkspace) => boolean;
}

export function createAssuranceSelectionAction(input: AssuranceSelectionActionInput) {
  return async (body: AssuranceSelectionApplyRequest): Promise<AssuranceSelectionApplyResponse | undefined> => {
    if (!input.requestGuard.canEditWorkspace()) throw new Error("A workspace operation is in progress");
    if (body.expectedRevision !== input.revision || JSON.stringify(body.workspace) !== JSON.stringify(input.workspace)) {
      throw new Error("Policy draft changed. Preview again.");
    }
    const request = input.requestGuard.begin();
    const response = await postJson("/api/assurance/apply", body);
    const result = await readJsonResponse<AssuranceSelectionApplyResponse & { error?: string }>(response);
    if (!response.ok) throw new Error(result.error ?? "Assurance apply failed");
    if (!input.requestGuard.isCurrent(request)) throw new Error("Policy draft changed. Preview again.");
    return input.adopt(result.workspace) ? result : undefined;
  };
}

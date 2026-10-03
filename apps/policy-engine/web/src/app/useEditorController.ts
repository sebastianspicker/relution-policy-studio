/** Composes workspace, recommendation, compliance, and action state into the editor's public controller. */
import type { EditorControllerResult } from "../shared/editor-contracts.js";
import {
  createEditorControllerActionInput,
  projectReadyEditorController,
} from "./editor-controller-assembly.js";
import { workspaceRequestGuardFor } from "../shared/editor-workspace-request-orthogonal.js";
import { useComplianceState } from "../features/assurance/useEditorComplianceState.js";
import { createEditorControllerActions } from "./editor-controller-actions.js";
import { useRecommendationState } from "../features/assurance/useEditorRecommendationState.js";
import { useWorkspaceState } from "../features/policy-workspace/useEditorWorkspaceState.js";

/** Returns the coordinated editor contract so UI surfaces share one source of truth. */
export function useEditorController(): EditorControllerResult {
  const workspace = useWorkspaceState();
  const recommendations = useRecommendationState({ policy: workspace.policy });
  const compliance = useComplianceState({ selection: workspace.selection, state: workspace.state, isDirty: workspace.isDirty, requestGuard: workspaceRequestGuardFor(workspace.setState) });

  if (workspace.state === undefined) {
    return workspace.loadError === undefined ? { kind: "loading" } : { kind: "error", message: workspace.loadError };
  }

  const currentState = workspace.state;
  const assemblyInput = { currentState, workspace, recommendations, compliance };
  const actions = createEditorControllerActions(createEditorControllerActionInput(assemblyInput));

  return {
    kind: "ready",
    controller: projectReadyEditorController({ ...assemblyInput, actions }),
  };
}

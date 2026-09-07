/** Composes server-backed and local workspace mutation actions. */
import { createAddConfigurationAction } from "./editor-workspace-mutation-configuration.js";
import { createLocalConfigurationActions } from "./editor-workspace-mutation-local.js";
import { createAddPolicyAction } from "./editor-workspace-mutation-policy.js";
import { createReconcileSidecarAction } from "../../shared/editor-workspace-mutation-sidecar.js";
import type { WorkspaceMutationActions, WorkspaceMutationInput } from "../../shared/editor-workspace-mutation-context.js";

export type { WorkspaceMutationInput } from "../../shared/editor-workspace-mutation-context.js";

export function createWorkspaceMutationActions(input: WorkspaceMutationInput): WorkspaceMutationActions {
  const localActions = createLocalConfigurationActions(input);
  return {
    addConfiguration: createAddConfigurationAction(input),
    addPolicy: createAddPolicyAction(input),
    removeConfiguration: localActions.removeConfiguration,
    moveConfiguration: localActions.moveConfiguration,
    reconcileSidecar: createReconcileSidecarAction(input),
  };
}

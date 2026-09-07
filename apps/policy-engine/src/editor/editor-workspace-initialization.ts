/** Adapts explicit CLI workspace creation to the editor-owned durable state boundary. */
import type { WorkspaceInitializationPort } from "../application/workspace-initialization.js";
import { initializeWorkspaceState } from "../workspace-state/persistence.js";

/** Publishes a new workspace with a missing sidecar so no prior editor state can survive replacement. */
export const editorWorkspaceInitializationPort: WorkspaceInitializationPort = {
  initializeWorkspace(workspaceDir, workspace, force) {
    initializeWorkspaceState(workspaceDir, { workspace, sidecar: { kind: "missing" } }, { force });
  },
};

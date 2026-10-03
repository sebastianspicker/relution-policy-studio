/** Adapts explicit CLI workspace creation to the editor-owned durable state boundary. */
import type { WorkspaceInitializationPort } from "../application/workspace-initialization.js";
import { initializeWorkspaceState } from "../workspace-state/persistence.js";
import { createWorkspaceExportReport, createWorkspaceMetadata } from "../workspace/workspace-model.js";

/** Publishes a new workspace with a missing sidecar so no prior editor state can survive replacement. */
export const editorWorkspaceInitializationPort: WorkspaceInitializationPort = {
  initializeWorkspace(workspaceDir, workspace, force) {
    initializeWorkspaceState(workspaceDir, { workspace, sidecar: { kind: "missing" } }, { force });
  },
};

/** Creates a valid empty host workspace without inventing a platform or policy. */
export function initializeEmptyEditorWorkspace(workspaceDir: string, serverVersion: string): void {
  initializeWorkspaceState(workspaceDir, {
    workspace: {
      metadata: createWorkspaceMetadata(serverVersion),
      report: createWorkspaceExportReport([]),
      policies: [],
    },
    sidecar: { kind: "missing" },
  });
}

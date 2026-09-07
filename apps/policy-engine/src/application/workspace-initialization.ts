/** Coordinates construction of a new workspace with its durable publication boundary. */
import { createNewWorkspaceInMemory } from "../workspace/workspace-creation.js";
import type { NewWorkspaceOptions, PolicyWorkspace } from "../workspace/types.js";

/** Effect boundary for publishing the editor-owned workspace and sidecar pair. */
export interface WorkspaceInitializationPort {
  initializeWorkspace(workspaceDir: string, workspace: PolicyWorkspace, force: boolean): void;
}

/** Builds a new workspace in memory, then delegates its composite publication. */
export function initializeNewWorkspace(options: NewWorkspaceOptions, port: WorkspaceInitializationPort): PolicyWorkspace {
  const workspace = createNewWorkspaceInMemory(options);
  port.initializeWorkspace(options.workspace, workspace, options.force === true);
  return workspace;
}

/** Runtime state owned by the optional unified CampusWeave host extension. */
import type { CampusWeavePlannerOptions } from "../../integrations/campusweave/planner-worker.js";
import type { CampusWeaveProjectStore } from "../../workspace-state/campusweave-project-store.js";

export interface CampusWeaveRuntime {
  readonly store: CampusWeaveProjectStore;
  readonly planner: CampusWeavePlannerOptions;
  activeWorkspaceId?: string;
  activeProjectId?: string;
  activeWorkspaceDir: string;
  readonly catalogDigest: string;
}

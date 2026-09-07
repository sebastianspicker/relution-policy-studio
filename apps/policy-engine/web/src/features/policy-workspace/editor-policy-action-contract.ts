import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import type { JsonRecord, Selection } from "../../shared/editor-contracts.js";
import type { cloneWorkspace } from "../../shared/editor-workspace-utils.js";

type MarkWorkspaceDirty = (workspace: ReturnType<typeof cloneWorkspace>, selection: Selection | undefined, message: string) => boolean;
export interface PolicyEditingActionsInput {
  readonly currentState: { readonly workspace: Parameters<MarkWorkspaceDirty>[0] }; readonly selection: Selection | undefined; readonly policy: WorkspacePolicy | undefined; readonly configuration: JsonRecord | undefined;
  readonly rawJson: string; readonly canonicalRawJson: string; readonly markWorkspaceDirty: MarkWorkspaceDirty; readonly setRawJsonState: (value: string) => void; readonly setRawJsonDirty: (value: boolean) => void; readonly setActionErrorStatus: (message: string) => void; readonly setActionSuccessStatus: (message: string) => void;
}

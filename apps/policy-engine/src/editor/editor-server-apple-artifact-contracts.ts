/** Contract for one DDM or MDM-command sidecar artifact route family. */
import type { AppleSchemaCatalog, AppleSchemaValues } from "../apple/apple-schema-types.js";
import type { JsonRecord } from "./editor-http-error.js";
import type { EditorRequestContext } from "./editor-server-contract.js";
import type { EditorSidecarState } from "../workspace-state/sidecar-types.js";

export type ManagedAppleArtifactRoute = {
  readonly basePath: string;
  readonly add: (context: EditorRequestContext, body: JsonRecord) => (sidecar: EditorSidecarState) => EditorSidecarState;
  readonly update: (sidecar: EditorSidecarState, catalog: AppleSchemaCatalog, uuid: string, values: AppleSchemaValues, revision: string) => EditorSidecarState;
  readonly remove: (sidecar: EditorSidecarState, uuid: string, revision: string) => EditorSidecarState;
};

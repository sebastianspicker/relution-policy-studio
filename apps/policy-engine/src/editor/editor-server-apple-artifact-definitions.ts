/** Defines schema-kind checks and persistence operations for Apple artifacts. */
import { createDdmArtifact, createMdmCommandArtifact } from "../apple/apple-schema-body.js";
import { findAppleSchemaEntry } from "../apple/apple-schema-catalog-access.js";
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import { optionalRecord, requireString } from "./editor-api-request-input.js";
import { badRequest } from "./editor-http-error.js";
import type { ManagedAppleArtifactRoute } from "./editor-server-apple-artifact-contracts.js";
import {
  addDdmArtifact,
  addMdmCommandArtifact,
  removeDdmArtifact,
  removeMdmCommandArtifact,
  updateDdmArtifact,
  updateMdmCommandArtifact,
} from "./sidecar-artifact-actions.js";
import {
  ddmAuthoringEntryError,
  isDdmAuthoringEntry,
  isMdmCommandEntry,
  mdmCommandEntryError,
} from "./sidecar-artifact-contracts.js";

export const DDM_ARTIFACT_ROUTE: ManagedAppleArtifactRoute = {
  basePath: "/api/ddm/artifact",
  add: ({ appleSchema }, body) => {
    const entry = requireDdmAuthoringEntry(appleSchema, requireString(body, "schemaId"));
    return (sidecar) => addDdmArtifact(sidecar, createDdmArtifact(entry, optionalRecord(body, "values") ?? {}), appleSchema.source.revision);
  },
  update: updateDdmArtifact,
  remove: removeDdmArtifact,
};

export const MDM_COMMAND_ARTIFACT_ROUTE: ManagedAppleArtifactRoute = {
  basePath: "/api/mdm-command/artifact",
  add: ({ appleSchema }, body) => {
    const entry = requireMdmCommandEntry(appleSchema, requireString(body, "schemaId"));
    return (sidecar) => addMdmCommandArtifact(sidecar, createMdmCommandArtifact(entry, optionalRecord(body, "values") ?? {}), appleSchema.source.revision);
  },
  update: updateMdmCommandArtifact,
  remove: removeMdmCommandArtifact,
};

function requireDdmAuthoringEntry(catalog: AppleSchemaCatalog, schemaId: string) {
  const entry = requireAppleSchemaEntry(catalog, schemaId);
  if (!isDdmAuthoringEntry(entry)) throw badRequest(ddmAuthoringEntryError(entry));
  return entry;
}

function requireMdmCommandEntry(catalog: AppleSchemaCatalog, schemaId: string) {
  const entry = requireAppleSchemaEntry(catalog, schemaId);
  if (!isMdmCommandEntry(entry)) throw badRequest(mdmCommandEntryError(entry));
  return entry;
}

function requireAppleSchemaEntry(catalog: AppleSchemaCatalog, schemaId: string) {
  const entry = findAppleSchemaEntry(catalog, schemaId);
  if (entry === undefined) throw badRequest(`Unknown Apple schema entry: ${schemaId}`);
  return entry;
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { createDdmArtifact, createMdmCommandArtifact, findAppleSchemaEntry, type AppleSchemaCatalog } from "./apple-schema.js";
import { sendJson } from "./editor-routes-utils.js";
import { badRequest, optionalRecord, optionalString, readJsonBody, requireNumber, requireString, type JsonRecord } from "./editor-server-helpers.js";
import type { EditorApiHandler, EditorRequestContext } from "./editor-server.js";
import {
  addDdmArtifact,
  addMdmCommandArtifact,
  loadEditorSidecar,
  removeDdmArtifact,
  removeMdmCommandArtifact,
  updateDdmArtifact,
  updateMdmCommandArtifact,
} from "./sidecar.js";
import { inspectMobileConfigText } from "./plist.js";
import {
  addAppleSchemaProfileToWorkspace,
  addCustomSettingsToWorkspace,
  validateWorkspace,
  type PolicyWorkspace,
} from "./workspace.js";

export async function handleAppleArtifactApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  for (const handler of APPLE_ARTIFACT_API_HANDLERS) {
    if (await handler(url, request, response, context)) return true;
  }
  return false;
}

async function handleAppleProfileApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options, bundle, appleSchema } = context;
  if (url.pathname === "/api/apple-profile/add" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = addAppleSchemaProfileToWorkspace(options.workspace, appleSchema, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      schemaId: requireString(body, "schemaId"),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle), sidecar: loadEditorSidecar(options.workspace) });
    return true;
  }
  if (url.pathname === "/api/custom-settings/add" && request.method === "POST") {
    const workspace = addCustomSettingsFromBody(options.workspace, await readJsonBody(request));
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle), sidecar: loadEditorSidecar(options.workspace) });
    return true;
  }
  return false;
}

async function handleDdmArtifactApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options, appleSchema } = context;
  if (url.pathname === "/api/ddm/artifact" && request.method === "POST") {
    const body = await readJsonBody(request);
    const entry = requireDdmAuthoringEntry(appleSchema, requireString(body, "schemaId"));
    const sidecar = addDdmArtifact(options.workspace, createDdmArtifact(entry, optionalRecord(body, "values") ?? {}), appleSchema.source.revision);
    sendJson(response, 200, { sidecar });
    return true;
  }
  if (url.pathname === "/api/ddm/artifact/update" && request.method === "POST") {
    const body = await readJsonBody(request);
    const sidecar = updateDdmArtifact(options.workspace, appleSchema, requireString(body, "uuid"), optionalRecord(body, "values") ?? {}, appleSchema.source.revision);
    sendJson(response, 200, { sidecar });
    return true;
  }
  if (url.pathname === "/api/ddm/artifact/remove" && request.method === "POST") {
    const body = await readJsonBody(request);
    sendJson(response, 200, { sidecar: removeDdmArtifact(options.workspace, requireString(body, "uuid"), appleSchema.source.revision) });
    return true;
  }
  return false;
}

async function handleMdmCommandArtifactApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options, appleSchema } = context;
  if (url.pathname === "/api/mdm-command/artifact" && request.method === "POST") {
    const body = await readJsonBody(request);
    const entry = requireMdmCommandEntry(appleSchema, requireString(body, "schemaId"));
    const sidecar = addMdmCommandArtifact(options.workspace, createMdmCommandArtifact(entry, optionalRecord(body, "values") ?? {}), appleSchema.source.revision);
    sendJson(response, 200, { sidecar });
    return true;
  }
  if (url.pathname === "/api/mdm-command/artifact/update" && request.method === "POST") {
    const body = await readJsonBody(request);
    const sidecar = updateMdmCommandArtifact(options.workspace, appleSchema, requireString(body, "uuid"), optionalRecord(body, "values") ?? {}, appleSchema.source.revision);
    sendJson(response, 200, { sidecar });
    return true;
  }
  if (url.pathname === "/api/mdm-command/artifact/remove" && request.method === "POST") {
    const body = await readJsonBody(request);
    sendJson(response, 200, { sidecar: removeMdmCommandArtifact(options.workspace, requireString(body, "uuid"), appleSchema.source.revision) });
    return true;
  }
  return false;
}

async function handleMobileConfigInspectApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  if (url.pathname === "/api/mobileconfig/inspect" && request.method === "POST") {
    const body = await readJsonBody(request);
    sendJson(response, 200, inspectMobileConfigText(requireString(body, "rawContent")));
    return true;
  }
  return false;
}

const APPLE_ARTIFACT_API_HANDLERS: readonly EditorApiHandler[] = [
  handleAppleProfileApiRequest,
  handleDdmArtifactApiRequest,
  handleMdmCommandArtifactApiRequest,
  handleMobileConfigInspectApiRequest,
];

function requireAppleSchemaEntry(catalog: AppleSchemaCatalog, schemaId: string) {
  const entry = findAppleSchemaEntry(catalog, schemaId);
  if (entry === undefined) {
    throw badRequest(`Unknown Apple schema entry: ${schemaId}`);
  }
  return entry;
}

function requireDdmAuthoringEntry(catalog: AppleSchemaCatalog, schemaId: string) {
  const entry = requireAppleSchemaEntry(catalog, schemaId);
  if (entry.kind === undefined) {
    throw badRequest(`Apple schema entry has no kind: ${entry.id}`);
  }
  if (!entry.kind.startsWith("ddm-") || entry.kind === "ddm-status") {
    throw badRequest(`Apple schema entry is not a DDM authoring declaration: ${entry.id}`);
  }
  return entry;
}

function requireMdmCommandEntry(catalog: AppleSchemaCatalog, schemaId: string) {
  const entry = requireAppleSchemaEntry(catalog, schemaId);
  if (entry.kind !== "mdm-command") {
    throw badRequest(`Apple schema entry is not an MDM command: ${entry.id}`);
  }
  return entry;
}

function addCustomSettingsFromBody(workspacePath: string, body: JsonRecord): PolicyWorkspace {
  const customSettingsOptions: Parameters<typeof addCustomSettingsToWorkspace>[1] = {
    policyPath: requireString(body, "policyPath"),
    versionIndex: requireNumber(body, "versionIndex"),
    domain: optionalString(body, "domain") ?? "com.example.app",
    settings: optionalRecord(body, "settings") ?? {},
  };
  const displayName = optionalString(body, "displayName");
  if (displayName !== undefined) {
    customSettingsOptions.displayName = displayName;
  }
  return addCustomSettingsToWorkspace(workspacePath, customSettingsOptions);
}

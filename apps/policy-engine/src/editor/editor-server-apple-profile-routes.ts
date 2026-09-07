/** Handles workspace mutations that create Apple profile configurations. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { optionalRecord, optionalString, requireNumber, requireString } from "./editor-api-request-input.js";
import { readJsonBody } from "./editor-json-body.js";
import { sendJson } from "./editor-routes-utils.js";
import { editorWorkspaceStateInput, type EditorRequestContext } from "./editor-server-contract.js";
import { addAppleSchemaProfileToLoadedWorkspace } from "../workspace/workspace-configuration-actions.js";
import { addCustomSettingsToLoadedWorkspace } from "../workspace/workspace-custom-settings-actions.js";
import { validateWorkspace } from "../workspace/workspace-validation.js";
import type { PolicyWorkspace } from "../workspace/types.js";
import { mutateEditorWorkspaceState } from "../workspace-state/editor-port.js";
import { parseExpectedRevisionBody } from "./editor-domain-request-input.js";

export async function handleAppleProfileApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  if (url.pathname === "/api/apple-profile/add" && request.method === "POST") {
    await addAppleSchemaProfile(url, request, response, context);
    return true;
  }
  if (url.pathname === "/api/custom-settings/add" && request.method === "POST") {
    await addCustomSettings(url, request, response, context);
    return true;
  }
  return false;
}

async function addAppleSchemaProfile(
  _url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<void> {
  const body = await readJsonBody(request);
  const expectedRevision = parseExpectedRevisionBody(body);
  const { workspace, sidecar, revision } = mutateEditorWorkspaceState(editorWorkspaceStateInput(context), (current) => addAppleSchemaProfileToLoadedWorkspace(current, context.appleSchema, {
    policyPath: requireString(body, "policyPath"),
    versionIndex: requireNumber(body, "versionIndex"),
    schemaId: requireString(body, "schemaId"),
  }), expectedRevision);
  sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, context.bundle), sidecar, revision });
}

async function addCustomSettings(
  _url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<void> {
  const body = await readJsonBody(request);
  const expectedRevision = parseExpectedRevisionBody(body);
  const { workspace, sidecar, revision } = mutateEditorWorkspaceState(editorWorkspaceStateInput(context), (current) => addCustomSettingsFromBody(current, body), expectedRevision);
  sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, context.bundle), sidecar, revision });
}

function addCustomSettingsFromBody(workspace: PolicyWorkspace, body: Record<string, unknown>): PolicyWorkspace {
  const options: Parameters<typeof addCustomSettingsToLoadedWorkspace>[1] = {
    policyPath: requireString(body, "policyPath"),
    versionIndex: requireNumber(body, "versionIndex"),
    domain: optionalString(body, "domain") ?? "com.example.app",
    settings: optionalRecord(body, "settings") ?? {},
  };
  const displayName = optionalString(body, "displayName");
  if (displayName !== undefined) options.displayName = displayName;
  return addCustomSettingsToLoadedWorkspace(workspace, options);
}

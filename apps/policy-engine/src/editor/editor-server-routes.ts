/** Composes editor API handlers in their externally observable precedence order. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAppleArtifactApiRequest } from "./editor-server-apple-routes.js";
import { handleArchiveApiRequest, handleComplianceApiRequest } from "./editor-server-archive-compliance-routes.js";
import { runEditorApiHandlers, type EditorApiHandler, type EditorRequestContext } from "./editor-server-contract.js";
import { handleWorkspaceApiRequest } from "./editor-server-workspace-routes.js";
import { handleWorkspaceMutationApiRequest } from "./editor-workspace-mutation-routes.js";
import { requireString } from "./editor-api-request-input.js";
import { readJsonBody } from "./editor-json-body.js";
import { handleReadOnlyApiRequest } from "./editor-server-readonly-routes.js";
import { handleRelutionApiRequest } from "./integrations/relution/relution-editor-router.js";
import { sendJson } from "./editor-routes-utils.js";
import { handleZammadApiRequest } from "./integrations/zammad/zammad-editor-dispatcher.js";
import { validateEditorKeyForOutput } from "./editor-key-validation.js";

export async function routeEditorApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  return await runEditorApiHandlers(EDITOR_API_HANDLERS, url, request, response, context);
}

async function handleKeyApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  if (url.pathname !== "/api/key" || request.method !== "POST") return false;
  const key = requireString(await readJsonBody(request), "key");
  const keyValidation = validateEditorKeyForOutput(context.options.out, key);
  context.runtimeState.key = key;
  context.runtimeState.keyValidation = keyValidation;
  sendJson(response, 200, keyValidation);
  return true;
}

const EDITOR_API_HANDLERS: readonly EditorApiHandler[] = [
  handleReadOnlyApiRequest,
  handleComplianceApiRequest,
  async (url, request, response, context) => await handleRelutionApiRequest(
    url, request, response, context.runtimeState.relution, context.options.workspace,
    context.options.allowLocalServiceHosts === true, context.options.serviceTransport,
  ),
  async (url, request, response, context) => await handleZammadApiRequest(
    url, request, response, context.runtimeState.zammad, context.options.allowLocalServiceHosts === true,
    context.options.workspace, context.options.serviceTransport,
  ),
  handleArchiveApiRequest,
  handleWorkspaceApiRequest,
  handleAppleArtifactApiRequest,
  handleWorkspaceMutationApiRequest,
  handleKeyApiRequest,
];

/** Handles workspace state and policy CRUD endpoints for the editor. */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  loadEditorState,
  prepareWorkspaceReplacement,
  reconcileRoundTripState,
  replaceWorkspaceState,
  validateWorkspaceState,
} from "../application/editor-workspace-state.js";
import { sendJson } from "./editor-routes-utils.js";
import { createEditorWorkspaceStatePort } from "../workspace-state/editor-port.js";
import { parseExpectedRevisionBody, parseWorkspaceBody } from "./editor-domain-request-input.js";
import { badRequest, HttpError } from "./editor-http-error.js";
import { readJsonBody } from "./editor-json-body.js";
import { editorWorkspaceStateInput, type EditorRequestContext } from "./editor-server-contract.js";

const IMPORT_JSON_BODY_LIMIT_BYTES = 64 * 1024 * 1024;

export async function handleWorkspaceApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { bundle } = context;
  const state = createEditorWorkspaceStatePort(editorWorkspaceStateInput(context));
  if (url.pathname === "/api/workspace" && request.method === "POST") {
    const body = await readJsonBody(request, IMPORT_JSON_BODY_LIMIT_BYTES);
    let workspace;
    let expectedRevision;
    try {
      workspace = prepareWorkspaceReplacement(parseWorkspaceBody(body));
      expectedRevision = parseExpectedRevisionBody(body);
    } catch (error) {
      throw clientInputError(error);
    }
    sendJson(response, 200, replaceWorkspaceState(workspace, expectedRevision, bundle, state));
    return true;
  }
  if (url.pathname === "/api/workspace/validate" && request.method === "POST") {
    const body = await readJsonBody(request, IMPORT_JSON_BODY_LIMIT_BYTES);
    try {
      sendJson(response, 200, { validation: validateWorkspaceState(parseWorkspaceBody(body), bundle) });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  if (url.pathname === "/api/roundtrip/sidecar" && request.method === "GET") {
    sendJson(response, 200, loadEditorState(state));
    return true;
  }
  if (url.pathname === "/api/roundtrip/reconcile" && request.method === "POST") {
    const body = await readJsonBody(request);
    sendJson(response, 200, reconcileRoundTripState(parseExpectedRevisionBody(body), bundle, state));
    return true;
  }
  return false;
}

function clientInputError(error: unknown): HttpError {
  return error instanceof HttpError ? error : badRequest(error instanceof Error ? error.message : String(error));
}

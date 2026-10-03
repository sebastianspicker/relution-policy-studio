/** Serves the editor's read-only state, catalog, and recommendation routes. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAppleCompatReport } from "../assurance/apple-compat-report.js";
import {
  listBaselineTemplateOptions,
  loadBaselineTemplate,
} from "../assurance/baseline-template-storage.js";
import { loadBaselineExpertOptions } from "../assurance/baseline-template-expert.js";
import { parseBaselineTemplatePlatform, parseBaselineTemplateShape, parseBaselineTemplateTier } from "../assurance/baseline-template-selection.js";
import { badRequest, HttpError } from "./editor-http-error.js";
import { handleOutputApiRequest } from "./editor-output-route.js";
import { sendJson } from "./editor-routes-utils.js";
import { editorWorkspaceStateInput, runEditorApiHandlers, type EditorApiHandler, type EditorRequestContext } from "./editor-server-contract.js";
import { handleRecommendationApiRequest } from "./editor-server-recommendation-routes.js";
import { listTemplates } from "../assurance/template-bundle.js";
import { validateWorkspace } from "../workspace/workspace-validation.js";
import { loadEditorWorkspaceState } from "../workspace-state/editor-port.js";

export function handleReadOnlyApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> | boolean {
  if (request.method !== "GET") return false;
  return runEditorApiHandlers(READ_ONLY_API_HANDLERS, url, request, response, context);
}

function handleStateApiRequest(
  url: URL,
  _request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): boolean {
  if (url.pathname !== "/api/state") return false;
  const { options, bundle, appleSchema, runtimeState } = context;
  const { workspace, sidecar, revision } = loadEditorWorkspaceState(editorWorkspaceStateInput(context));
  sendJson(response, 200, {
    bundle,
    workspace,
    validation: validateWorkspace(workspace, bundle),
    outputFile: options.out,
    keySet: runtimeState.key.length > 0,
    keyValidated: runtimeState.keyValidation.validated,
    ...(runtimeState.keyValidation.reason === undefined ? {} : { keyValidationReason: runtimeState.keyValidation.reason }),
    appleCompat: createAppleCompatReport(bundle),
    appleSchema,
    sidecar,
    revision,
    active_workspace_id: runtimeState.campusweave?.activeWorkspaceId ?? null,
    campusweave_catalog_digest: runtimeState.campusweave?.catalogDigest ?? null,
  });
  return true;
}

function handleCatalogApiRequest(
  url: URL,
  _request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): boolean {
  const { bundle, appleSchema } = context;
  if (url.pathname === "/api/apple-compat") {
    sendJson(response, 200, createAppleCompatReport(bundle));
    return true;
  }
  if (url.pathname === "/api/templates") {
    sendJson(response, 200, { templates: listTemplates(bundle, url.searchParams.get("platform") ?? undefined) });
    return true;
  }
  if (url.pathname === "/api/baseline-templates") {
    sendJson(response, 200, listBaselineTemplateOptions());
    return true;
  }
  if (url.pathname === "/api/baseline-templates/expert") {
    sendJson(response, 200, loadBaselineExpertOptions(parseBaselineSelection(url, false)));
    return true;
  }
  if (url.pathname === "/api/baseline-templates/template") {
    sendJson(response, 200, loadBaselineTemplate(parseBaselineSelection(url, true)));
    return true;
  }
  if (url.pathname === "/api/apple-schema") {
    sendJson(response, 200, appleSchema);
    return true;
  }
  return false;
}

function parseBaselineSelection(url: URL, includeTier: false): Parameters<typeof loadBaselineExpertOptions>[0];
function parseBaselineSelection(url: URL, includeTier: true): Parameters<typeof loadBaselineTemplate>[0];
function parseBaselineSelection(url: URL, includeTier: boolean) {
  try {
    const base = {
      platform: parseBaselineTemplatePlatform(url.searchParams.get("platform")),
      shape: parseBaselineTemplateShape(url.searchParams.get("shape")),
    };
    return includeTier ? { ...base, tier: parseBaselineTemplateTier(url.searchParams.get("tier")) } : base;
  } catch (error) {
    throw clientInputError(error);
  }
}

const READ_ONLY_API_HANDLERS: readonly EditorApiHandler[] = [
  handleStateApiRequest,
  handleCatalogApiRequest,
  handleRecommendationApiRequest,
  handleOutputApiRequest,
];

function clientInputError(error: unknown): HttpError {
  return error instanceof HttpError ? error : badRequest(error instanceof Error ? error.message : String(error));
}

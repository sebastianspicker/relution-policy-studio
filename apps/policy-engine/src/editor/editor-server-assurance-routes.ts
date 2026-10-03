/** Reviews exact assurance selections on the workspace queue without saving policy drafts. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadAssuranceCatalog, loadAssuranceDetail, listAssuranceSnapshots, type AssuranceCatalogRootOptions } from "../assurance/assurance-catalog-loader.js";
import { parseAssuranceSelectionRequest, parseAssuranceSelectionApplyRequest } from "../assurance/assurance-selection-request.js";
import { prepareAssuranceSelection, applyPreparedAssuranceSelection } from "../assurance/assurance-selection.js";
import { loadEditorWorkspaceState } from "../workspace-state/editor-port.js";
import { editorWorkspaceStateInput, type EditorRequestContext } from "./editor-server-contract.js";
import { badRequest, HttpError } from "./editor-http-error.js";
import { LARGE_JSON_BODY_LIMIT_BYTES, readJsonBody } from "./editor-json-body.js";
import { sendJson } from "./editor-routes-utils.js";

export async function handleAssuranceApiRequest(
  url: URL, request: IncomingMessage, response: ServerResponse, context: EditorRequestContext,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/assurance/")) return false;
  const options = assuranceOptions(context, url.searchParams.get("snapshotDigest") ?? undefined);
  if (request.method === "GET") return handleAssuranceRead(url, response, options);
  if (request.method !== "POST" || !["/api/assurance/preview", "/api/assurance/apply"].includes(url.pathname)) return false;
  const apply = url.pathname === "/api/assurance/apply";
  const body = await readJsonBody(request, LARGE_JSON_BODY_LIMIT_BYTES);
  let input;
  try { input = apply ? parseAssuranceSelectionApplyRequest(body) : parseAssuranceSelectionRequest(body); }
  catch (error) { throw badRequest(errorMessage(error)); }
  // This handler runs inside the existing workspace mutation queue. Nothing is
  // awaited between this revision check, source reload and result computation.
  const current = loadEditorWorkspaceState(editorWorkspaceStateInput(context), input.expectedRevision);
  const catalog = requireAssuranceCatalog(assuranceOptions(context, input.snapshotDigest), apply ? 409 : 503);
  const dependencies = { catalog, bundle: context.bundle, appleSchema: context.appleSchema, workspaceRevision: current.revision };
  try {
    if (apply) {
      const result = applyPreparedAssuranceSelection(parseAssuranceSelectionApplyRequest(body), dependencies);
      sendJson(response, 200, result);
    } else {
      const result = prepareAssuranceSelection(input, dependencies);
      sendJson(response, 200, result.preview);
    }
  } catch (error) { throw new HttpError(apply ? 409 : 400, errorMessage(error)); }
  return true;
}

function handleAssuranceRead(url: URL, response: ServerResponse, options: AssuranceCatalogRootOptions): boolean {
  if (url.pathname === "/api/assurance/snapshots") {
    try { sendJson(response, 200, listAssuranceSnapshots(options)); }
    catch (error) { throw new HttpError(503, errorMessage(error), true); }
    return true;
  }
  if (url.pathname === "/api/assurance/detail") {
    const recommendationId = url.searchParams.get("recommendationId");
    if (!recommendationId) throw badRequest("recommendationId is required");
    const loaded = requireAssuranceCatalog(options);
    try {
      const detail = loadAssuranceDetail(recommendationId, { ...options, snapshotDigest: loaded.snapshotDigest });
      sendJson(response, 200, { detail, snapshotDigest: loaded.snapshotDigest, detailsDigest: loaded.detailsDigest });
    } catch (error) { throw new HttpError(404, errorMessage(error), true); }
    return true;
  }
  if (!["/api/assurance/catalog", "/api/assurance/presets"].includes(url.pathname)) return false;
  const loaded = requireAssuranceCatalog(options);
  sendJson(response, 200, url.pathname.endsWith("/presets") ? {
    presets: loaded.presets.presets, assuranceDigest: loaded.assuranceDigest,
    snapshotDigest: loaded.snapshotDigest, presetDigest: loaded.presetDigest, sourceDigests: loaded.sourceDigests,
  } : loaded);
  return true;
}

function requireAssuranceCatalog(options: AssuranceCatalogRootOptions, status = 503) {
  const loaded = loadAssuranceCatalog(options);
  if (loaded.status !== "available") throw new HttpError(status, loaded.error, true);
  return loaded;
}

function assuranceOptions(context: EditorRequestContext, snapshotDigest?: string): AssuranceCatalogRootOptions {
  return {
    ...(context.options.assuranceRootDir === undefined ? {} : { rootDir: context.options.assuranceRootDir }),
    ...(snapshotDigest === undefined ? {} : { snapshotDigest }),
  };
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

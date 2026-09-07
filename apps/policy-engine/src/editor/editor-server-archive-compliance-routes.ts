/** Handles archive creation and compliance evaluation editor endpoints. */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyCompliance,
  buildVerifiedArchive,
  checkCompliance,
} from "../application/editor-archive-compliance.js";
import { loadComplianceArtifacts } from "../assurance/compliance-artifacts.js";
import { sendJson } from "./editor-routes-utils.js";
import { captureEditorArchiveSnapshot, loadEditorWorkspaceState, mutateEditorWorkspaceState } from "../workspace-state/editor-port.js";
import type { EditorSidecarState } from "../workspace-state/sidecar-types.js";
import { buildVerifiedEditorArchive } from "./editor-build-publish.js";
import { validateWorkspaceState } from "../application/editor-workspace-state.js";
import { importEditorArchive } from "./editor-archive-import.js";
import { optionalString, requireString } from "./editor-api-request-input.js";
import { parseComplianceTargetBody, parseExpectedRevisionBody, parseRecommendationSourceBody, parseRecommendationSourcesBody, type ComplianceTargetBody } from "./editor-domain-request-input.js";
import { badRequest, HttpError, type JsonRecord } from "./editor-http-error.js";
import { readJsonBody } from "./editor-json-body.js";
import { editorWorkspaceStateInput, type EditorRequestContext } from "./editor-server-contract.js";

const IMPORT_JSON_BODY_LIMIT_BYTES = 64 * 1024 * 1024;

export async function handleComplianceApiRequest(
  url: URL, request: IncomingMessage, response: ServerResponse, context: EditorRequestContext,
): Promise<boolean> {
  if (url.pathname === "/api/compliance/check" && request.method === "POST") {
    const body = await readJsonBody(request);
    const target = parseComplianceTargetBody(body);
    const sources = parseRecommendationSourcesBody(body);
    const expectedRevision = parseExpectedRevisionBody(body);
    const current = loadEditorWorkspaceState(editorWorkspaceStateInput(context), expectedRevision);
    sendJson(response, 200, {
      report: checkCompliance({ workspace: current.workspace, selection: resolveComplianceSelection(current.workspace, target), sources }, loadedComplianceDependencies(context, sources)),
      revision: current.revision,
    });
    return true;
  }
  if (url.pathname !== "/api/compliance/apply" || request.method !== "POST") return false;
  const body = await readJsonBody(request);
  let input: ReturnType<typeof parseComplianceApplicationInput>;
  try { input = parseComplianceApplicationInput(body); }
  catch (error) { throw clientInputError(error); }
  const dependencies = loadedComplianceDependencies(context, input.sources);
  let result: ReturnType<typeof applyCompliance> | undefined;
  const persisted = mutateEditorWorkspaceState(
    editorWorkspaceStateInput(context),
    (workspace) => {
      result = applyCompliance({ ...input, workspace, selection: resolveComplianceSelection(workspace, input.target) }, dependencies);
      return result.workspace;
    },
    input.expectedRevision,
  );
  sendJson(response, 200, { ...persisted, validation: validateWorkspaceState(persisted.workspace, context.bundle), report: result!.report });
  return true;
}

export async function handleArchiveApiRequest(
  url: URL, request: IncomingMessage, response: ServerResponse, context: EditorRequestContext,
): Promise<boolean> {
  if (url.pathname === "/api/import" && request.method === "POST") {
    await handleArchiveImportRequest(request, response, context);
    return true;
  }
  if (url.pathname === "/api/build" && request.method === "POST") {
    handleArchiveBuildRequest(response, context);
    return true;
  }
  return false;
}

async function handleArchiveImportRequest(
  request: IncomingMessage, response: ServerResponse, context: EditorRequestContext,
): Promise<void> {
  const { runtimeState } = context;
  const body = await readJsonBody(request, IMPORT_JSON_BODY_LIMIT_BYTES);
  const expectedRevision = parseExpectedRevisionBody(body);
  const importKey = optionalString(body, "key") ?? runtimeState.key;
  if (importKey.length === 0) throw badRequest("Import requires an archive passphrase");
  const result = importEditorArchive({
    archive: Buffer.from(requireString(body, "dataBase64"), "base64"),
    key: importKey,
    workspaceDir: context.options.workspace,
    bundle: context.bundle,
    appleSchemaRevision: context.appleSchema.source.revision,
    expectedRevision,
  });
  runtimeState.key = result.key;
  runtimeState.keyValidation = { keySet: true, validated: true };
  sendJson(response, 200, { ...result, keySet: true });
}

function handleArchiveBuildRequest(response: ServerResponse, context: EditorRequestContext): void {
  const { runtimeState } = context;
  if (runtimeState.key.length === 0) {
    sendJson(response, 400, { error: "Build requires an archive passphrase. Enter one in Settings and click Set passphrase." });
    return;
  }
  let result: ReturnType<typeof buildVerifiedArchive<EditorSidecarState>>;
  try {
    result = buildVerifiedArchive(runtimeState.key, {
      bundle: context.bundle,
      archive: {
        captureSnapshot: () => captureEditorArchiveSnapshot(
          editorWorkspaceStateInput(context),
          (key, workspace) => buildVerifiedEditorArchive({ workspace, output: context.options.out, key }),
        ),
      },
    });
  } catch (error) { throw badRequest(error instanceof Error ? error.message : String(error)); }
  if (result.kind === "validation-failed") {
    sendJson(response, 400, { validation: result.validation, ...(result.constraintsRemoved.length === 0 ? {} : { constraintsRemoved: result.constraintsRemoved }) });
    return;
  }
  if (result.kind === "verification-failed") {
    sendArchiveBuildVerificationFailure(response, result);
    return;
  }
  runtimeState.keyValidation = { keySet: true, validated: true };
  sendJson(response, 200, {
    validation: result.validation,
    verification: result.verification,
    outputFile: context.options.out,
    sidecar: result.sidecar,
    ...(result.constraintsRemoved.length === 0 ? {} : { constraintsRemoved: result.constraintsRemoved }),
  });
}

function sendArchiveBuildVerificationFailure(
  response: ServerResponse,
  result: Extract<ReturnType<typeof buildVerifiedArchive<EditorSidecarState>>, { readonly kind: "verification-failed" }>,
): void {
  const failedEntryCount = result.verification.checkedEntries.filter((entry) => entry.hashStatus !== "match").length;
  sendJson(response, 500, { error: `Build verification failed for ${failedEntryCount} archive entr${failedEntryCount === 1 ? "y" : "ies"}`, validation: result.validation, verification: result.verification, failedEntryCount, ...(result.constraintsRemoved.length === 0 ? {} : { constraintsRemoved: result.constraintsRemoved }) });
}

function parseComplianceApplicationInput(body: JsonRecord) {
  const target = parseComplianceTargetBody(body);
  const source = parseRecommendationSourceBody(body);
  const sources = [...new Set([...parseRecommendationSourcesBody(body), source])];
  return {
    expectedRevision: parseExpectedRevisionBody(body), target, sources, source,
    recommendationId: requireString(body, "recommendationId"), remediationId: requireString(body, "remediationId"),
  };
}

function complianceDependencies(context: EditorRequestContext) {
  return {
    bundle: context.bundle,
    appleSchema: context.appleSchema,
    catalogs: { load: (sources: Parameters<typeof loadComplianceArtifacts>[0]) => loadComplianceArtifacts(sources) },
  };
}

function loadedComplianceDependencies(context: EditorRequestContext, sources: readonly Parameters<typeof loadComplianceArtifacts>[0][number][]) {
  const catalogs = loadComplianceArtifacts([...sources]);
  return { ...complianceDependencies(context), catalogs: { load: () => catalogs } };
}

function resolveComplianceSelection(workspace: { readonly policies: readonly { readonly path: string }[] }, target: ComplianceTargetBody) {
  const policyIndex = workspace.policies.findIndex((policy) => policy.path === target.policyPath);
  if (policyIndex < 0) throw badRequest(`Policy not found in workspace: ${target.policyPath}`);
  return { policyIndex, versionIndex: target.versionIndex };
}
function clientInputError(error: unknown): HttpError { return error instanceof HttpError ? error : badRequest(error instanceof Error ? error.message : String(error)); }

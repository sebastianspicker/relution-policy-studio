import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppleCompatReport } from "./apple-compat.js";
import { loadAppleSchemaCatalog } from "./apple-schema-catalog.js";
import { baselineTemplateApiResponse } from "./baseline-template-routes.js";
import { applyComplianceRemediationToWorkspace, buildComplianceReport, loadComplianceArtifacts } from "./compliance.js";
import {
  loadEditorSidecar, replaceEditorSidecarFromWorkspace,
  reconcileMobileConfigRestoreEntries, recordMobileConfigRestoreEntries,
} from "./sidecar.js";
import { type RecommendationSource } from "./recommendation-types.js";
import {
  isRecommendationSource,
  listRecommendationCatalogs,
  loadRecommendationCatalog,
  loadRecommendationCoverage,
  loadRecommendationSemanticIndex,
  loadUnifiedRecommendationAnalysis,
} from "./recommendations.js";
import { extractRexp, packPlainDirectory, verifyRexp } from "./rexp.js";
import { handleRelutionApiRequest, type RelutionEditorRuntime } from "./relution-editor-routes.js";
import { handleZammadApiRequest, type ZammadEditorRuntime } from "./zammad-editor-routes.js";
import { sendJson } from "./editor-routes-utils.js";
import {
  addAppleCompatConfigurationToWorkspace, addConfigurationToWorkspace,
  addPolicyToWorkspace, loadWorkspace, moveConfigurationInWorkspace,
  removeConfigurationFromWorkspace, saveWorkspace, schemaCompatibilityIssues, validateWorkspace, type PolicyWorkspace,
} from "./workspace.js";
import { loadTemplateBundle, listTemplates, type RelutionTemplateBundle } from "./templates.js";
import type { AppleSchemaCatalog } from "./apple-schema.js";
import {
  HttpError, assertNetworkApiToken, assertSafeApiRequestHost, assertSafeEditorHost, assertSafeMutatingApiRequest,
  badRequest, createNetworkApiToken, editorUrlWithNetworkToken,
  optionalString,
  parseComplianceSelectionBody,
  parseRecommendationSourceBody,
  parseRecommendationSourcesBody,
  parseWorkspaceBody,
  readJsonBody,
  requireNumber,
  requireString,
  type JsonRecord,
} from "./editor-server-helpers.js";
import { validateEditorKeyForOutput, type EditorKeyValidationResponse } from "./editor-key-validation.js";
import { outputFileName, resolveStaticAssetPath, serveStaticAsset } from "./editor-static-assets.js";
import { handleAppleArtifactApiRequest } from "./editor-server-apple-routes.js";
export { resolveStaticAssetPath };
export interface EditorServerOptions {
  workspace: string;
  key: string;
  out: string;
  allowNetworkHost?: boolean;
  allowLocalServiceHosts?: boolean;
  bundlePath?: string;
  host?: string;
  port?: number;
}

export interface EditorServerHandle {
  url: string;
  close: () => Promise<void>;
}

export interface EditorRuntimeState {
  key: string;
  keyValidation: EditorKeyValidationResponse;
  relution: RelutionEditorRuntime;
  zammad: ZammadEditorRuntime;
  networkApiToken?: string;
}

export interface EditorRequestContext {
  readonly options: EditorServerOptions;
  readonly bundle: RelutionTemplateBundle;
  readonly appleSchema: AppleSchemaCatalog;
  readonly runtimeState: EditorRuntimeState;
}

export type EditorApiHandler = (url: URL, request: IncomingMessage, response: ServerResponse, context: EditorRequestContext) => boolean | Promise<boolean>;
type ComplianceApplyResult = ReturnType<typeof applyComplianceRemediationToWorkspace> & {
  readonly selection: ReturnType<typeof parseComplianceSelectionBody>;
  readonly sources: RecommendationSource[];
};

const STATIC_ROOT = fileURLToPath(new URL("../../dist-web", import.meta.url));
const IMPORT_JSON_BODY_LIMIT_BYTES = 64 * 1024 * 1024;

export async function startEditorServer(options: EditorServerOptions): Promise<EditorServerHandle> {
  const host = options.host ?? "127.0.0.1";
  assertSafeEditorHost(host, options.allowNetworkHost === true);
  const port = options.port ?? 8787;
  const bundle = loadTemplateBundle(options.bundlePath);
  const appleSchema = loadAppleSchemaCatalog();
  const networkApiToken = options.allowNetworkHost === true ? createNetworkApiToken() : undefined;
  const runtimeState: EditorRuntimeState = {
    key: options.key,
    keyValidation: validateEditorKeyForOutput(options.out, options.key),
    relution: { lastDevices: [] },
    zammad: {},
    ...(networkApiToken === undefined ? {} : { networkApiToken }),
  };

  const server = createServer((request, response) => {
    void handleRequest(request, response, options, bundle, appleSchema, runtimeState).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) {
        console.error(error);
      }
      sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;

  return {
    url: editorUrlWithNetworkToken(host, actualPort, networkApiToken),
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error !== undefined) {
            rejectClose(error);
            return;
          }
          resolveClose();
        });
      }),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: EditorServerOptions,
  bundle: RelutionTemplateBundle,
  appleSchema: AppleSchemaCatalog,
  runtimeState: EditorRuntimeState,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const context: EditorRequestContext = { options, bundle, appleSchema, runtimeState };
  if (url.pathname.startsWith("/api/")) {
    assertSafeApiRequestHost(request, options);
    assertNetworkApiToken(request, runtimeState.networkApiToken);
  }
  if (url.pathname.startsWith("/api/") && request.method === "POST") {
    assertSafeMutatingApiRequest(request, options);
  }
  if (await routeEditorApiRequest(url, request, response, context)) return;
  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: `Unknown API endpoint: ${request.method ?? "GET"} ${url.pathname}` });
    return;
  }
  serveStaticAsset(STATIC_ROOT, url.pathname, response);
}

async function routeEditorApiRequest(url: URL, request: IncomingMessage, response: ServerResponse, context: EditorRequestContext): Promise<boolean> {
  for (const handler of EDITOR_API_HANDLERS) {
    if (await handler(url, request, response, context)) return true;
  }
  return false;
}

async function handleWorkspaceApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options, bundle, appleSchema } = context;
  if (url.pathname === "/api/workspace" && request.method === "POST") {
    const body = await readJsonBody(request, IMPORT_JSON_BODY_LIMIT_BYTES);
    const previousWorkspace = loadWorkspace(options.workspace);
    const previousSidecar = captureSidecarState(options.workspace);
    try {
      const workspace = parseWorkspaceBody(body);
      saveWorkspace(options.workspace, workspace);
      const persisted = loadWorkspace(options.workspace);
      const sidecar = recordMobileConfigRestoreEntries(options.workspace, persisted, appleSchema.source.revision);
      sendJson(response, 200, { workspace: persisted, validation: validateWorkspace(persisted, bundle), sidecar });
    } catch (error) {
      rollbackPersistedEditorState(options.workspace, previousWorkspace, previousSidecar, error);
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  if (url.pathname === "/api/workspace/validate" && request.method === "POST") {
    const body = await readJsonBody(request, IMPORT_JSON_BODY_LIMIT_BYTES);
    try {
      sendJson(response, 200, { validation: validateWorkspace(parseWorkspaceBody(body), bundle) });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  if (url.pathname === "/api/roundtrip/sidecar" && request.method === "GET") {
    sendJson(response, 200, loadEditorSidecar(options.workspace));
    return true;
  }
  if (url.pathname === "/api/roundtrip/reconcile" && request.method === "POST") {
    const workspace = reconcileMobileConfigRestoreEntries(loadWorkspace(options.workspace), loadEditorSidecar(options.workspace));
    saveWorkspace(options.workspace, workspace);
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle), sidecar: loadEditorSidecar(options.workspace) });
    return true;
  }
  return false;
}

async function handleWorkspaceMutationApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options, bundle } = context;
  if (url.pathname === "/api/add-configuration" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = addConfigurationToWorkspace(options.workspace, bundle, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      type: requireString(body, "type"),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle) });
    return true;
  }
  if (url.pathname === "/api/apple-compat/add" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = addAppleCompatConfigurationToWorkspace(options.workspace, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      settingId: requireString(body, "settingId"),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle) });
    return true;
  }
  if (url.pathname === "/api/configuration/remove" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = removeConfigurationFromWorkspace(options.workspace, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      configurationIndex: requireNumber(body, "configurationIndex"),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle) });
    return true;
  }
  if (url.pathname === "/api/configuration/move" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = moveConfigurationInWorkspace(options.workspace, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      configurationIndex: requireNumber(body, "configurationIndex"),
      direction: requireMoveDirection(body),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle) });
    return true;
  }
  if (url.pathname === "/api/add-policy" && request.method === "POST") {
    const body = await readJsonBody(request);
    const result = addPolicyToWorkspace(options.workspace, bundle, {
      platform: requireString(body, "platform"),
      name: requireString(body, "name"),
    });
    sendJson(response, 200, { workspace: result.workspace, validation: validateWorkspace(result.workspace, bundle), policyPath: result.policyPath });
    return true;
  }
  return false;
}

async function handleKeyApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options, runtimeState } = context;
  if (url.pathname !== "/api/key" || request.method !== "POST") {
    return false;
  }
  const body = await readJsonBody(request);
  const key = requireString(body, "key");
  const keyValidation = validateEditorKeyForOutput(options.out, key);
  runtimeState.key = key;
  runtimeState.keyValidation = keyValidation;
  sendJson(response, 200, keyValidation);
  return true;
}

const EDITOR_API_HANDLERS: readonly EditorApiHandler[] = [
  handleReadOnlyApiRequest,
  handleComplianceApiRequest,
  async (url, request, response, context) =>
    await handleRelutionApiRequest(
      url,
      request,
      response,
      context.runtimeState.relution,
      context.options.workspace,
      context.options.allowLocalServiceHosts === true,
    ),
  async (url, request, response, context) =>
    await handleZammadApiRequest(url, request, response, context.runtimeState.zammad, context.options.allowLocalServiceHosts === true),
  handleArchiveApiRequest,
  handleWorkspaceApiRequest,
  handleAppleArtifactApiRequest,
  handleWorkspaceMutationApiRequest,
  handleKeyApiRequest,
];

function handleReadOnlyApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): boolean {
  if (request.method !== "GET") {
    return false;
  }
  for (const handler of READ_ONLY_API_HANDLERS) {
    if (handler(url, request, response, context)) return true;
  }
  return false;
}

function handleStateApiRequest(
  url: URL,
  _request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): boolean {
  const { options, bundle, appleSchema, runtimeState } = context;
  if (url.pathname === "/api/state") {
    const workspace = loadWorkspace(options.workspace);
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
      sidecar: loadEditorSidecar(options.workspace),
    });
    return true;
  }
  return false;
}

function handleCatalogApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): boolean {
  const { bundle, appleSchema } = context;
  if (url.pathname === "/api/apple-compat") {
    sendJson(response, 200, createAppleCompatReport(bundle));
    return true;
  }
  if (url.pathname === "/api/templates") {
    const platform = url.searchParams.get("platform") ?? undefined;
    sendJson(response, 200, { templates: listTemplates(bundle, platform) });
    return true;
  }
  const baselineTemplateResponse = baselineTemplateApiResponse(url, request.method);
  if (baselineTemplateResponse !== undefined) {
    sendJson(response, baselineTemplateResponse.status, baselineTemplateResponse.body);
    return true;
  }
  if (url.pathname === "/api/apple-schema") {
    sendJson(response, 200, appleSchema);
    return true;
  }
  return false;
}

function handleRecommendationApiRequest(
  url: URL,
  _request: IncomingMessage,
  response: ServerResponse,
): boolean {
  if (url.pathname === "/api/recommendations") {
    sendJson(response, 200, listRecommendationCatalogs());
    return true;
  }
  if (url.pathname === "/api/recommendations/coverage") {
    sendJson(response, 200, loadRecommendationCoverage());
    return true;
  }
  if (url.pathname === "/api/recommendations/semantics") {
    sendJson(response, 200, loadRecommendationSemanticIndex());
    return true;
  }
  if (url.pathname === "/api/recommendations/semantic-analysis") {
    sendJson(response, 200, loadUnifiedRecommendationAnalysis());
    return true;
  }
  if (url.pathname.startsWith("/api/recommendations/")) {
    const source = url.pathname.slice("/api/recommendations/".length);
    if (!isRecommendationSource(source)) {
      sendJson(response, 404, { error: `Unknown recommendation source: ${source}` });
      return true;
    }
    sendJson(response, 200, loadRecommendationCatalog(source));
    return true;
  }
  return false;
}

function handleOutputApiRequest(
  url: URL,
  _request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): boolean {
  const { options } = context;
  if (url.pathname === "/api/output") {
    if (!existsSync(options.out) || !statSync(options.out).isFile()) {
      sendJson(response, 404, { error: "No built .rexp output is available yet" });
      return true;
    }
    response.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${outputFileName(options.out)}"`,
    });
    response.end(readFileSync(options.out));
    return true;
  }
  return false;
}

const READ_ONLY_API_HANDLERS: readonly EditorApiHandler[] = [
  handleStateApiRequest,
  handleCatalogApiRequest,
  handleRecommendationApiRequest,
  handleOutputApiRequest,
];

async function handleComplianceApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  for (const handler of COMPLIANCE_API_HANDLERS) {
    if (await handler(url, request, response, context)) return true;
  }
  return false;
}

async function handleComplianceCheckApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { bundle, appleSchema } = context;
  if (url.pathname === "/api/compliance/check" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = parseWorkspaceBody(body);
    const selection = parseComplianceSelectionBody(body);
    const sources = parseRecommendationSourcesBody(body);
    sendJson(response, 200, {
      report: buildComplianceReport({
        workspace,
        selection,
        sources,
        catalogs: loadComplianceArtifacts(sources),
        bundle,
        appleSchema,
      }),
    });
    return true;
  }
  return false;
}

async function handleComplianceApplyApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options } = context;
  if (url.pathname === "/api/compliance/apply" && request.method === "POST") {
    const body = await readJsonBody(request);
    const previousWorkspace = loadWorkspace(options.workspace);
    const previousSidecar = captureSidecarState(options.workspace);
    try {
      sendAppliedComplianceResponse(response, context, applyComplianceRequestBody(body, context));
    } catch (error) {
      rollbackPersistedEditorState(options.workspace, previousWorkspace, previousSidecar, error);
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  return false;
}

const COMPLIANCE_API_HANDLERS: readonly EditorApiHandler[] = [
  handleComplianceCheckApiRequest,
  handleComplianceApplyApiRequest,
];

async function handleArchiveApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options, bundle, appleSchema, runtimeState } = context;
  if (url.pathname === "/api/import" && request.method === "POST") {
    const body = await readJsonBody(request, IMPORT_JSON_BODY_LIMIT_BYTES);
    const importKey = optionalString(body, "key") ?? runtimeState.key;
    if (importKey.length === 0) {
      throw badRequest("Import requires an encryption key");
    }
    const previousWorkspace = loadWorkspace(options.workspace);
    const previousSidecar = captureSidecarState(options.workspace);
    const previousKey = runtimeState.key;
    const previousKeyValidation = runtimeState.keyValidation;
    const archive = Buffer.from(requireString(body, "dataBase64"), "base64");
    const importDir = mkdtempSync(join(tmpdir(), "relution-rexp-import-"));
    const archivePath = join(importDir, "import.rexp");
    const extractedDir = join(importDir, "workspace");
    try {
      writeFileSync(archivePath, archive);
      extractRexp(archivePath, extractedDir, importKey, { force: true, pretty: true });
      const workspace = loadWorkspace(extractedDir);
      saveWorkspace(options.workspace, workspace);
      const sidecar = replaceEditorSidecarFromWorkspace(options.workspace, workspace, appleSchema.source.revision);
      runtimeState.key = importKey;
      runtimeState.keyValidation = { keySet: true, validated: true };
      sendJson(response, 200, {
        workspace,
        validation: validateWorkspace(workspace, bundle),
        keySet: true,
        sidecar,
      });
    } catch (error) {
      runtimeState.key = previousKey;
      runtimeState.keyValidation = previousKeyValidation;
      rollbackPersistedEditorState(options.workspace, previousWorkspace, previousSidecar, error);
      throw error;
    } finally {
      rmSync(importDir, { recursive: true, force: true });
    }
    return true;
  }
  if (url.pathname === "/api/build" && request.method === "POST") {
    if (runtimeState.key.length === 0) {
      sendJson(response, 400, { error: "Build requires an encryption key. Enter one in the toolbar and click Set key." });
      return true;
    }
    const workspace = loadWorkspace(options.workspace);
    const validation = validateWorkspace(workspace, bundle);
    const constraintsRemoved = schemaCompatibilityIssues(bundle).map((issue) => ({
      path: issue.path,
      constraint: issue.kind === "invalid-pattern" ? "pattern" : issue.kind,
      original: issue.pattern,
    }));
    if (!validation.ok) {
      sendJson(response, 400, { validation, ...(constraintsRemoved.length === 0 ? {} : { constraintsRemoved }) });
      return true;
    }
    const sidecar = recordMobileConfigRestoreEntries(options.workspace, workspace, appleSchema.source.revision);
    packPlainDirectory(options.workspace, options.out, runtimeState.key, { force: true });
    const verification = verifyRexp(options.out, runtimeState.key);
    if (!verification.ok) {
      const failedEntryCount = verification.checkedEntries.filter((entry) => entry.hashStatus !== "match").length;
      sendJson(response, 500, {
        error: `Build verification failed for ${failedEntryCount} archive entr${failedEntryCount === 1 ? "y" : "ies"}`,
        validation,
        verification,
        failedEntryCount,
        ...(constraintsRemoved.length === 0 ? {} : { constraintsRemoved }),
      });
      return true;
    }
    runtimeState.keyValidation = { keySet: true, validated: true };
    sendJson(response, 200, {
      validation,
      verification,
      outputFile: options.out,
      sidecar,
      ...(constraintsRemoved.length === 0 ? {} : { constraintsRemoved }),
    });
    return true;
  }
  return false;
}

function applyComplianceRequestBody(body: JsonRecord, context: EditorRequestContext): ComplianceApplyResult {
  const { bundle, appleSchema } = context;
  const workspace = parseWorkspaceBody(body);
  const selection = parseComplianceSelectionBody(body);
  const source = parseRecommendationSourceBody(body);
  const sources = [...new Set([...parseRecommendationSourcesBody(body), source])];
  return {
    ...applyComplianceRemediationToWorkspace({
      workspace,
      selection,
      sources,
      source,
      recommendationId: requireString(body, "recommendationId"),
      remediationId: requireString(body, "remediationId"),
      catalogs: loadComplianceArtifacts(sources),
      bundle,
      appleSchema,
    }),
    selection,
    sources,
  };
}

function sendAppliedComplianceResponse(response: ServerResponse, context: EditorRequestContext, result: ComplianceApplyResult): void {
  const { options, bundle, appleSchema } = context;
  const validation = validateWorkspace(result.workspace, bundle);
  if (!validation.ok) {
    throw badRequest(`Compliance remediation produced an invalid workspace: ${validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
  }
  saveWorkspace(options.workspace, result.workspace);
  const persisted = loadWorkspace(options.workspace);
  const sidecar = recordMobileConfigRestoreEntries(options.workspace, persisted, appleSchema.source.revision);
  const report = buildComplianceReport({
    workspace: persisted,
    selection: result.selection,
    sources: result.sources,
    catalogs: loadComplianceArtifacts(result.sources),
    bundle,
    appleSchema,
  });
  sendJson(response, 200, { workspace: persisted, validation, sidecar, report });
}

function requireMoveDirection(body: JsonRecord): "up" | "down" {
  const direction = requireString(body, "direction");
  if (direction !== "up" && direction !== "down") {
    throw badRequest(`Unsupported move direction: ${direction}`);
  }
  return direction;
}

type SidecarPathState =
  | { kind: "missing" }
  | { kind: "directory" }
  | { kind: "file"; contents: string }
  | { kind: "symlink"; target: string };

function captureSidecarState(workspaceDir: string): SidecarPathState {
  const path = join(workspaceDir, "editor-sidecar.json");
  if (!existsSync(path)) {
    return { kind: "missing" };
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    return { kind: "symlink", target: readlinkSync(path) };
  }
  if (stat.isDirectory()) {
    return { kind: "directory" };
  }
  return { kind: "file", contents: readFileSync(path, "utf8") };
}

function restoreSidecarState(workspaceDir: string, snapshot: SidecarPathState): void {
  const path = join(workspaceDir, "editor-sidecar.json");
  rmSync(path, { recursive: true, force: true });

  if (snapshot.kind === "missing") {
    return;
  }
  if (snapshot.kind === "directory") {
    mkdirSync(path, { recursive: true });
    return;
  }
  if (snapshot.kind === "symlink") {
    symlinkSync(snapshot.target, path);
    return;
  }
  writeFileSync(path, snapshot.contents);
}

function rollbackPersistedEditorState(
  workspaceDir: string,
  previousWorkspace: PolicyWorkspace,
  previousSidecar: SidecarPathState,
  originalError: unknown,
): void {
  const rollbackErrors: string[] = [];

  try {
    saveWorkspace(workspaceDir, previousWorkspace);
  } catch (error) {
    rollbackErrors.push(`workspace rollback failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    restoreSidecarState(workspaceDir, previousSidecar);
  } catch (error) {
    rollbackErrors.push(`sidecar rollback failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (rollbackErrors.length > 0) {
    const originalMessage = originalError instanceof Error ? originalError.message : String(originalError);
    throw new Error(`${originalMessage}; ${rollbackErrors.join("; ")}`);
  }
}

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAppleCompatReport } from "./apple-compat.js";
import { loadAppleSchemaCatalog } from "./apple-schema-catalog.js";
import { baselineTemplateApiResponse } from "./baseline-template-routes.js";
import { createDdmArtifact, createMdmCommandArtifact, findAppleSchemaEntry } from "./apple-schema.js";
import {
  applyComplianceRemediationToWorkspace,
  buildComplianceReport,
} from "./compliance.js";
import {
  addDdmArtifact,
  addMdmCommandArtifact,
  loadEditorSidecar,
  replaceEditorSidecarFromWorkspace,
  reconcileMobileConfigRestoreEntries,
  recordMobileConfigRestoreEntries,
  removeDdmArtifact,
  removeMdmCommandArtifact,
  updateDdmArtifact,
  updateMdmCommandArtifact,
} from "./sidecar.js";
import { inspectMobileConfigText } from "./plist.js";
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
import { createRelutionEditorRuntime, handleRelutionApiRequest, type RelutionEditorRuntime } from "./relution-editor-routes.js";
import { createZammadEditorRuntime, handleZammadApiRequest, type ZammadEditorRuntime } from "./zammad-editor-routes.js";
import {
  addAppleCompatConfigurationToWorkspace,
  addAppleSchemaProfileToWorkspace,
  addConfigurationToWorkspace,
  addCustomSettingsToWorkspace,
  addPolicyToWorkspace,
  loadWorkspace,
  moveConfigurationInWorkspace,
  replaceWorkspace,
  removeConfigurationFromWorkspace,
  saveWorkspace,
  validateWorkspace,
  type PolicyWorkspace,
} from "./workspace.js";
import { loadTemplateBundle, listTemplates, type RelutionTemplateBundle } from "./templates.js";
import type { AppleSchemaCatalog } from "./apple-schema.js";
import {
  HttpError, assertNetworkApiToken, assertSafeEditorHost, assertSafeMutatingApiRequest,
  badRequest, createNetworkApiToken, editorUrlWithNetworkToken, handleNetworkTokenBootstrap,
  loadComplianceArtifacts,
  optionalRecord,
  optionalString,
  parseComplianceSelectionBody,
  parseRecommendationSourceBody,
  parseRecommendationSourcesBody,
  parseWorkspaceBody,
  readJsonBody,
  requireNumber,
  requireString,
  shouldServeSpaIndex,
  uniqueRecommendationSources,
} from "./editor-server-helpers.js";

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

type JsonRecord = Record<string, unknown>;
interface EditorRuntimeState {
  key: string;
  relution: RelutionEditorRuntime;
  zammad: ZammadEditorRuntime;
  networkApiToken?: string;
}

interface EditorRequestContext {
  readonly options: EditorServerOptions;
  readonly bundle: RelutionTemplateBundle;
  readonly appleSchema: AppleSchemaCatalog;
  readonly runtimeState: EditorRuntimeState;
}

const STATIC_ROOT = fileURLToPath(new URL("../../dist-web", import.meta.url));
const IMPORT_JSON_BODY_LIMIT_BYTES = 64 * 1024 * 1024;

export async function startEditorServer(options: EditorServerOptions): Promise<EditorServerHandle> {
  const host = options.host ?? "127.0.0.1";
  assertSafeEditorHost(host, options.allowNetworkHost === true);
  const port = options.port ?? 8787;
  const bundle = loadTemplateBundle(options.bundlePath);
  const appleSchema = loadAppleSchemaCatalog();
  const networkApiToken = options.allowNetworkHost === true ? createNetworkApiToken() : undefined;
  const runtimeState: EditorRuntimeState = { key: options.key, relution: createRelutionEditorRuntime(), zammad: createZammadEditorRuntime(), ...(networkApiToken === undefined ? {} : { networkApiToken }) };

  const server = createServer((request, response) => {
    void handleRequest(request, response, options, bundle, appleSchema, runtimeState).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
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
  if (handleNetworkTokenBootstrap(url, request, response, runtimeState.networkApiToken)) return;
  if (url.pathname.startsWith("/api/")) {
    assertNetworkApiToken(request, runtimeState.networkApiToken);
  }
  if (url.pathname.startsWith("/api/") && request.method === "POST") {
    assertSafeMutatingApiRequest(request, options);
  }
  if (handleReadOnlyApiRequest(url, request, response, context)) {
    return;
  }
  if (await handleComplianceApiRequest(url, request, response, context)) {
    return;
  }
  if (await handleRelutionApiRequest(url, request, response, runtimeState.relution, options.workspace, options.allowLocalServiceHosts === true)) {
    return;
  }
  if (await handleZammadApiRequest(url, request, response, runtimeState.zammad, options.allowLocalServiceHosts === true)) {
    return;
  }
  if (await handleArchiveApiRequest(url, request, response, context)) {
    return;
  }
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
    return;
  }
  if (url.pathname === "/api/workspace/validate" && request.method === "POST") {
    const body = await readJsonBody(request, IMPORT_JSON_BODY_LIMIT_BYTES);
    try {
      sendJson(response, 200, { validation: validateWorkspace(parseWorkspaceBody(body), bundle) });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (url.pathname === "/api/apple-profile/add" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = addAppleSchemaProfileToWorkspace(options.workspace, appleSchema, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      schemaId: requireString(body, "schemaId"),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle), sidecar: loadEditorSidecar(options.workspace) });
    return;
  }
  if (url.pathname === "/api/custom-settings/add" && request.method === "POST") {
    const body = await readJsonBody(request);
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
    const workspace = addCustomSettingsToWorkspace(options.workspace, customSettingsOptions);
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle), sidecar: loadEditorSidecar(options.workspace) });
    return;
  }
  if (url.pathname === "/api/ddm/artifact" && request.method === "POST") {
    const body = await readJsonBody(request);
    const entry = requireAppleSchemaEntry(appleSchema, requireString(body, "schemaId"));
    if (!entry.kind.startsWith("ddm-") || entry.kind === "ddm-status") {
      throw badRequest(`Apple schema entry is not a DDM authoring declaration: ${entry.id}`);
    }
    const sidecar = addDdmArtifact(options.workspace, createDdmArtifact(entry, optionalRecord(body, "values") ?? {}), appleSchema.source.revision);
    sendJson(response, 200, { sidecar });
    return;
  }
  if (url.pathname === "/api/mdm-command/artifact" && request.method === "POST") {
    const body = await readJsonBody(request);
    const entry = requireAppleSchemaEntry(appleSchema, requireString(body, "schemaId"));
    if (entry.kind !== "mdm-command") {
      throw badRequest(`Apple schema entry is not an MDM command: ${entry.id}`);
    }
    const sidecar = addMdmCommandArtifact(options.workspace, createMdmCommandArtifact(entry, optionalRecord(body, "values") ?? {}), appleSchema.source.revision);
    sendJson(response, 200, { sidecar });
    return;
  }
  if (url.pathname === "/api/ddm/artifact/update" && request.method === "POST") {
    const body = await readJsonBody(request);
    const sidecar = updateDdmArtifact(
      options.workspace,
      appleSchema,
      requireString(body, "uuid"),
      optionalRecord(body, "values") ?? {},
      appleSchema.source.revision,
    );
    sendJson(response, 200, { sidecar });
    return;
  }
  if (url.pathname === "/api/mdm-command/artifact/update" && request.method === "POST") {
    const body = await readJsonBody(request);
    const sidecar = updateMdmCommandArtifact(
      options.workspace,
      appleSchema,
      requireString(body, "uuid"),
      optionalRecord(body, "values") ?? {},
      appleSchema.source.revision,
    );
    sendJson(response, 200, { sidecar });
    return;
  }
  if (url.pathname === "/api/ddm/artifact/remove" && request.method === "POST") {
    const body = await readJsonBody(request);
    sendJson(response, 200, { sidecar: removeDdmArtifact(options.workspace, requireString(body, "uuid"), appleSchema.source.revision) });
    return;
  }
  if (url.pathname === "/api/mdm-command/artifact/remove" && request.method === "POST") {
    const body = await readJsonBody(request);
    sendJson(response, 200, { sidecar: removeMdmCommandArtifact(options.workspace, requireString(body, "uuid"), appleSchema.source.revision) });
    return;
  }
  if (url.pathname === "/api/mobileconfig/inspect" && request.method === "POST") {
    const body = await readJsonBody(request);
    sendJson(response, 200, inspectMobileConfigText(requireString(body, "rawContent")));
    return;
  }
  if (url.pathname === "/api/roundtrip/sidecar" && request.method === "GET") {
    sendJson(response, 200, loadEditorSidecar(options.workspace));
    return;
  }
  if (url.pathname === "/api/roundtrip/reconcile" && request.method === "POST") {
    const workspace = reconcileMobileConfigRestoreEntries(loadWorkspace(options.workspace), loadEditorSidecar(options.workspace));
    replaceWorkspace(options.workspace, workspace);
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle), sidecar: loadEditorSidecar(options.workspace) });
    return;
  }
  if (url.pathname === "/api/add-configuration" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = addConfigurationToWorkspace(options.workspace, bundle, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      type: requireString(body, "type"),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle) });
    return;
  }
  if (url.pathname === "/api/apple-compat/add" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = addAppleCompatConfigurationToWorkspace(options.workspace, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      settingId: requireString(body, "settingId"),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle) });
    return;
  }
  if (url.pathname === "/api/configuration/remove" && request.method === "POST") {
    const body = await readJsonBody(request);
    const workspace = removeConfigurationFromWorkspace(options.workspace, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      configurationIndex: requireNumber(body, "configurationIndex"),
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle) });
    return;
  }
  if (url.pathname === "/api/configuration/move" && request.method === "POST") {
    const body = await readJsonBody(request);
    const direction = requireString(body, "direction");
    if (direction !== "up" && direction !== "down") {
      throw badRequest(`Unsupported move direction: ${direction}`);
    }
    const workspace = moveConfigurationInWorkspace(options.workspace, {
      policyPath: requireString(body, "policyPath"),
      versionIndex: requireNumber(body, "versionIndex"),
      configurationIndex: requireNumber(body, "configurationIndex"),
      direction,
    });
    sendJson(response, 200, { workspace, validation: validateWorkspace(workspace, bundle) });
    return;
  }
  if (url.pathname === "/api/add-policy" && request.method === "POST") {
    const body = await readJsonBody(request);
    const result = addPolicyToWorkspace(options.workspace, bundle, {
      platform: requireString(body, "platform"),
      name: requireString(body, "name"),
    });
    sendJson(response, 200, {
      workspace: result.workspace,
      validation: validateWorkspace(result.workspace, bundle),
      policyPath: result.policyPath,
    });
    return;
  }
  if (url.pathname === "/api/key" && request.method === "POST") {
    const body = await readJsonBody(request);
    runtimeState.key = requireString(body, "key");
    sendJson(response, 200, { keySet: true });
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: `Unknown API endpoint: ${request.method ?? "GET"} ${url.pathname}` });
    return;
  }
  serveStatic(url.pathname, response);
}

function handleReadOnlyApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): boolean {
  if (request.method !== "GET") {
    return false;
  }
  const { options, bundle, appleSchema, runtimeState } = context;
  if (url.pathname === "/api/state") {
    const workspace = loadWorkspace(options.workspace);
    sendJson(response, 200, {
      bundle,
      workspace,
      validation: validateWorkspace(workspace, bundle),
      outputFile: options.out,
      keySet: runtimeState.key.length > 0,
      appleCompat: createAppleCompatReport(bundle),
      appleSchema,
      sidecar: loadEditorSidecar(options.workspace),
    });
    return true;
  }
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

async function handleComplianceApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  context: EditorRequestContext,
): Promise<boolean> {
  const { options, bundle, appleSchema } = context;
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
  if (url.pathname === "/api/compliance/apply" && request.method === "POST") {
    const body = await readJsonBody(request);
    const previousWorkspace = loadWorkspace(options.workspace);
    const previousSidecar = captureSidecarState(options.workspace);
    try {
      const workspace = parseWorkspaceBody(body);
      const selection = parseComplianceSelectionBody(body);
      const source = parseRecommendationSourceBody(body);
      const sources = uniqueRecommendationSources([...parseRecommendationSourcesBody(body), source]);
      const applied = applyComplianceRemediationToWorkspace({
        workspace,
        selection,
        sources,
        source,
        recommendationId: requireString(body, "recommendationId"),
        remediationId: requireString(body, "remediationId"),
        catalogs: loadComplianceArtifacts(sources),
        bundle,
        appleSchema,
      });
      const validation = validateWorkspace(applied.workspace, bundle);
      if (!validation.ok) {
        throw badRequest(`Compliance remediation produced an invalid workspace: ${validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ")}`);
      }
      saveWorkspace(options.workspace, applied.workspace);
      const persisted = loadWorkspace(options.workspace);
      const sidecar = recordMobileConfigRestoreEntries(options.workspace, persisted, appleSchema.source.revision);
      sendJson(response, 200, {
        workspace: persisted,
        validation,
        sidecar,
        report: buildComplianceReport({
          workspace: persisted,
          selection,
          sources,
          catalogs: loadComplianceArtifacts(sources),
          bundle,
          appleSchema,
        }),
      });
    } catch (error) {
      rollbackPersistedEditorState(options.workspace, previousWorkspace, previousSidecar, error);
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  return false;
}

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
    const archive = Buffer.from(requireString(body, "dataBase64"), "base64");
    const importDir = mkdtempSync(join(tmpdir(), "relution-rexp-import-"));
    const archivePath = join(importDir, "import.rexp");
    const extractedDir = join(importDir, "workspace");
    try {
      writeFileSync(archivePath, archive);
      extractRexp(archivePath, extractedDir, importKey, { force: true, pretty: true });
      const workspace = loadWorkspace(extractedDir);
      replaceWorkspace(options.workspace, workspace);
      const sidecar = replaceEditorSidecarFromWorkspace(options.workspace, workspace, appleSchema.source.revision);
      runtimeState.key = importKey;
      sendJson(response, 200, {
        workspace,
        validation: validateWorkspace(workspace, bundle),
        keySet: true,
        sidecar,
      });
    } catch (error) {
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
    if (!validation.ok) {
      sendJson(response, 400, { validation });
      return true;
    }
    recordMobileConfigRestoreEntries(options.workspace, workspace, appleSchema.source.revision);
    packPlainDirectory(options.workspace, options.out, runtimeState.key, { force: true });
    sendJson(response, 200, {
      validation,
      verification: verifyRexp(options.out, runtimeState.key),
      outputFile: options.out,
      sidecar: loadEditorSidecar(options.workspace),
    });
    return true;
  }
  return false;
}

function requireAppleSchemaEntry(catalog: AppleSchemaCatalog, schemaId: string) {
  const entry = findAppleSchemaEntry(catalog, schemaId);
  if (entry === undefined) {
    throw badRequest(`Unknown Apple schema entry: ${schemaId}`);
  }
  return entry;
}

function serveStatic(pathname: string, response: ServerResponse): void {
  const file = resolveStaticAssetPath(STATIC_ROOT, pathname);
  if (!existsSync(file)) {
    sendText(response, 404, "Editor assets are missing. Run pnpm build first.");
    return;
  }
  response.writeHead(200, { "content-type": contentType(file) });
  response.end(readFileSync(file));
}

export function resolveStaticAssetPath(staticRoot: string, pathname: string): string {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(staticRoot, relativePath);
  const index = join(staticRoot, "index.html");
  const withinRoot = candidate === staticRoot || candidate.startsWith(`${staticRoot}${sep}`);
  if (!withinRoot) {
    return index;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return shouldServeSpaIndex(pathname) ? index : candidate;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function sendText(response: ServerResponse, status: number, value: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(value);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function outputFileName(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? "output.rexp";
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
    replaceWorkspace(workspaceDir, previousWorkspace);
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


export function editorFileUrl(): string {
  return pathToFileURL(join(STATIC_ROOT, "index.html")).toString();
}

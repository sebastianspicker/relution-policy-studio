import { randomBytes } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { RECOMMENDATION_SOURCES, type RecommendationSource } from "./recommendation-types.js";
import { type ComplianceSelection, type ComplianceSourceArtifacts } from "./compliance.js";
import { isRecommendationSource, loadRecommendationCatalog, loadRecommendationSettingBundleCatalog } from "./recommendations.js";
import { type PolicyWorkspace } from "./workspace.js";
import type { EditorServerOptions } from "./editor-server.js";

type JsonRecord = Record<string, unknown>;

const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function readJsonBody(request: IncomingMessage, limitBytes = DEFAULT_JSON_BODY_LIMIT_BYTES): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > limitBytes) {
      throw new HttpError(413, `JSON body exceeds ${String(limitBytes)} bytes`);
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.length === 0 ? "{}" : text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw badRequest(`Invalid JSON body: ${message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw badRequest("Expected JSON object body");
  }
  return parsed as JsonRecord;
}

export function assertSafeMutatingApiRequest(request: IncomingMessage, options: EditorServerOptions): void {
  const host = requireRequestHost(request);
  if (options.allowNetworkHost !== true && !isLoopbackHostname(host.hostname)) {
    throw new HttpError(403, "Mutating editor API requests require a loopback Host header");
  }
  assertSameOrigin(request, host.host);
  assertJsonContentType(request);
}

export function createNetworkApiToken(): string {
  return randomBytes(32).toString("base64url");
}

export function editorUrlWithNetworkToken(host: string, port: number, token: string | undefined): string {
  const baseUrl = `http://${host}:${String(port)}/`;
  return token === undefined ? baseUrl : `${baseUrl}?editorToken=${token}`;
}

export function handleNetworkTokenBootstrap(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  token: string | undefined,
): boolean {
  if (token === undefined || request.method !== "GET" || url.searchParams.get("editorToken") !== token) {
    return false;
  }

  url.searchParams.delete("editorToken");
  response.writeHead(302, {
    "location": `${url.pathname}${url.search}${url.hash}`,
    "set-cookie": `relution_editor_token=${token}; HttpOnly; SameSite=Strict; Path=/`,
  });
  response.end();
  return true;
}

export function assertNetworkApiToken(request: IncomingMessage, token: string | undefined): void {
  if (token === undefined) {
    return;
  }
  if (firstHeaderValue(request.headers["x-relution-editor-token"]) === token) {
    return;
  }
  if (cookieValue(request.headers.cookie, "relution_editor_token") === token) {
    return;
  }
  throw new HttpError(403, "Network editor API requests require the editor token");
}

function requireRequestHost(request: IncomingMessage): { host: string; hostname: string } {
  const host = firstHeaderValue(request.headers.host);
  if (host === undefined || host.trim().length === 0) {
    throw new HttpError(400, "Mutating editor API requests require a Host header");
  }
  let parsed: URL;
  try {
    parsed = new URL(`http://${host}`);
  } catch {
    throw new HttpError(400, `Invalid Host header: ${host}`);
  }
  return { host: parsed.host.toLowerCase(), hostname: normalizeHostname(parsed.hostname) };
}

function assertSameOrigin(request: IncomingMessage, requestHost: string): void {
  const origin = firstHeaderValue(request.headers.origin);
  if (origin === undefined || origin.length === 0) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, `Invalid Origin header: ${origin}`);
  }
  if (parsed.protocol !== "http:" || parsed.host.toLowerCase() !== requestHost) {
    throw new HttpError(403, `Mutating editor API requests require same-origin requests: ${origin}`);
  }
}

function assertJsonContentType(request: IncomingMessage): void {
  const contentType = firstHeaderValue(request.headers["content-type"]);
  if (contentType === undefined || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new HttpError(415, "Mutating editor API requests require Content-Type: application/json");
  }
}

export function assertSafeEditorHost(host: string, allowNetworkHost: boolean): void {
  if (allowNetworkHost || isLoopbackHostname(normalizeHostname(host))) {
    return;
  }
  throw new Error(`Non-loopback editor host "${host}" requires --allow-network-editor`);
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (cookieHeader === undefined) {
    return undefined;
  }
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return rawValue.join("=");
    }
  }
  return undefined;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/u, "$1");
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "::1" || hostname === "0:0:0:0:0:0:0:1" || hostname.startsWith("127.");
}

export function parseWorkspaceBody(body: JsonRecord): PolicyWorkspace {
  const workspace = body.workspace;
  if (typeof workspace !== "object" || workspace === null || Array.isArray(workspace)) {
    throw badRequest("Expected workspace object");
  }
  return workspace as PolicyWorkspace;
}

export function parseComplianceSelectionBody(body: JsonRecord): ComplianceSelection {
  const selection = optionalRecord(body, "selection");
  if (selection === undefined) {
    throw badRequest("Expected selection object");
  }
  return {
    policyIndex: requireNumber(selection, "policyIndex"),
    versionIndex: requireNumber(selection, "versionIndex"),
  };
}

export function parseRecommendationSourcesBody(body: JsonRecord): RecommendationSource[] {
  const rawSources = body.sources;
  if (rawSources === undefined) {
    return [...RECOMMENDATION_SOURCES];
  }
  if (!Array.isArray(rawSources)) {
    throw badRequest("Expected sources array");
  }
  const sources = rawSources.map((entry) => {
    if (typeof entry !== "string" || !isRecommendationSource(entry)) {
      throw badRequest(`Unknown recommendation source: ${String(entry)}`);
    }
    return entry;
  });
  if (sources.length === 0) {
    throw badRequest("At least one recommendation source is required");
  }
  return uniqueRecommendationSources(sources);
}

export function parseRecommendationSourceBody(body: JsonRecord): RecommendationSource {
  const source = requireString(body, "source");
  if (!isRecommendationSource(source)) {
    throw badRequest(`Unknown recommendation source: ${source}`);
  }
  return source;
}

export function loadComplianceArtifacts(
  sources: RecommendationSource[],
): Partial<Record<RecommendationSource, ComplianceSourceArtifacts>> {
  const artifacts: Partial<Record<RecommendationSource, ComplianceSourceArtifacts>> = {};
  for (const source of sources) {
    const recommendationCatalog = loadRecommendationCatalog(source);
    if (!recommendationCatalog.available) {
      continue;
    }
    let settingBundleCatalog: ReturnType<typeof loadRecommendationSettingBundleCatalog> | undefined;
    try {
      settingBundleCatalog = loadRecommendationSettingBundleCatalog(source);
    } catch {
      settingBundleCatalog = undefined;
    }
    artifacts[source] = settingBundleCatalog === undefined
      ? { recommendationCatalog }
      : { recommendationCatalog, settingBundleCatalog };
  }
  return artifacts;
}

export function uniqueRecommendationSources(sources: RecommendationSource[]): RecommendationSource[] {
  return [...new Set(sources)];
}

export function requireString(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`Expected string body field: ${key}`);
  }
  return value;
}

export function optionalString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function optionalRecord(record: JsonRecord, key: string): JsonRecord | undefined {
  const value = record[key];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

export function requireNumber(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw badRequest(`Expected integer body field: ${key}`);
  }
  return value;
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function shouldServeSpaIndex(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/u, "");
  if (normalized.length === 0 || normalized === "/") {
    return true;
  }
  return !normalized.split("/").at(-1)?.includes(".");
}

import { randomBytes, timingSafeEqual } from "node:crypto";
import { type IncomingMessage } from "node:http";
import { isIP } from "node:net";
import { RECOMMENDATION_SOURCES, type RecommendationSource } from "./recommendation-types.js";
import { type ComplianceSelection } from "./compliance.js";
import { isRecommendationSource } from "./recommendations.js";
import { type PolicyWorkspace } from "./workspace.js";
import type { EditorServerOptions } from "./editor-server.js";
import type { JsonRecord } from "./utils/json-guards.js";

export type { JsonRecord };

const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;
const DEFAULT_JSON_MAX_DEPTH = 200;
const DEFAULT_JSON_MAX_ARRAY_ITEMS = 10_000;

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
  // Network editor mode can expose mutating workspace APIs beyond loopback; keep
  // a cheap shape scan before JSON.parse so byte-capped requests still reject
  // pathological nesting or wide arrays with a clear 413.
  assertJsonShapeWithinLimits(text);
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
  // The local editor has no login layer. Mutating requests are therefore scoped
  // to loopback/same-origin JSON so a random web page cannot submit form-style
  // requests that rewrite the user's workspace.
  const host = assertSafeApiRequestHost(request, options, "Mutating editor API requests");
  assertSameOrigin(request, host.host);
  assertJsonContentType(request);
}

export function assertSafeApiRequestHost(
  request: IncomingMessage,
  options: EditorServerOptions,
  label = "Editor API requests",
): { host: string; hostname: string } {
  const host = requireRequestHost(request, label);
  if (options.allowNetworkHost !== true && !isLoopbackHostname(host.hostname)) {
    throw new HttpError(403, `${label} require a loopback Host header`);
  }
  return host;
}

export function createNetworkApiToken(): string {
  return randomBytes(32).toString("base64url");
}

export function editorUrlWithNetworkToken(host: string, port: number, token: string | undefined): string {
  const baseUrl = `http://${host}:${String(port)}/`;
  return typeof token === "undefined" ? baseUrl : `${baseUrl}#editorToken=${encodeURIComponent(token)}`;
}

export function assertNetworkApiToken(request: IncomingMessage, token: string | undefined): void {
  if (typeof token === "undefined") {
    return;
  }
  const headerToken = firstHeaderValue(request.headers["x-relution-editor-token"]);
  if (typeof headerToken === "string" && constantTimeStringEqual(headerToken, token)) {
    return;
  }
  throw new HttpError(403, "Network editor API requests require the editor token");
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    timingSafeEqual(rightBuffer, rightBuffer);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function requireRequestHost(request: IncomingMessage, label: string): { host: string; hostname: string } {
  const host = firstHeaderValue(request.headers.host);
  if (host === undefined || host.trim().length === 0) {
    throw new HttpError(400, `${label} require a Host header`);
  }
  let parsed: URL;
  try {
    parsed = new URL(`http://${host}`);
  } catch {
    throw new HttpError(400, `Invalid Host header: ${host}`);
  }
  return { host: normalizedUrlHost(parsed), hostname: normalizeHostname(parsed.hostname) };
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
  if (parsed.protocol !== "http:" || normalizedUrlHost(parsed) !== requestHost) {
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

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/u, "$1");
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost") {
    return true;
  }
  const normalized = normalizeHostname(hostname);
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  const ipv4 = mappedIpv4 ?? normalized;
  return isIP(ipv4) === 4 && ipv4.startsWith("127.");
}

function normalizedUrlHost(url: URL): string {
  const hostname = normalizeHostname(url.hostname);
  const host = bracketIpv6Hostname(hostname);
  if (hasImplicitPort(url)) {
    return host;
  }
  return `${host}:${url.port}`;
}

function bracketIpv6Hostname(hostname: string): string {
  return hostname.includes(":") ? `[${hostname}]` : hostname;
}

function hasImplicitPort(url: URL): boolean {
  if (url.port.length === 0) {
    return true;
  }
  return (url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443");
}

function assertJsonShapeWithinLimits(text: string): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  const containers: Array<{ kind: "array" | "object"; itemCount: number; expectingValue: boolean }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === undefined) {
      continue;
    }
    if (inString) {
      ({ inString, escaped } = nextStringScannerState(char, escaped));
      continue;
    }
    if (char === "\"") {
      countArrayValueIfExpected(containers);
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      countArrayValueIfExpected(containers);
      depth = incrementJsonDepth(depth);
      containers.push({ kind: char === "[" ? "array" : "object", itemCount: 0, expectingValue: true });
      continue;
    }
    if (char === "}" || char === "]") {
      containers.pop();
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === ",") {
      const current = containers.at(-1);
      if (current?.kind === "array") {
        current.expectingValue = true;
      }
      continue;
    }
    if (/\S/u.test(char)) {
      countArrayValueIfExpected(containers);
    }
  }
}

function nextStringScannerState(char: string, escaped: boolean): { inString: boolean; escaped: boolean } {
  if (escaped) {
    return { inString: true, escaped: false };
  }
  if (char === "\\") {
    return { inString: true, escaped: true };
  }
  return { inString: char !== "\"", escaped: false };
}

function incrementJsonDepth(depth: number): number {
  const nextDepth = depth + 1;
  if (nextDepth > DEFAULT_JSON_MAX_DEPTH) {
    throw new HttpError(413, `JSON body exceeds maximum nesting depth ${String(DEFAULT_JSON_MAX_DEPTH)}`);
  }
  return nextDepth;
}

function countArrayValueIfExpected(containers: Array<{ kind: "array" | "object"; itemCount: number; expectingValue: boolean }>): void {
  const current = containers.at(-1);
  if (current?.kind !== "array" || !current.expectingValue) {
    return;
  }
  current.itemCount += 1;
  current.expectingValue = false;
  if (current.itemCount > DEFAULT_JSON_MAX_ARRAY_ITEMS) {
    throw new HttpError(413, `JSON array exceeds ${String(DEFAULT_JSON_MAX_ARRAY_ITEMS)} items`);
  }
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
  return [...new Set(sources)];
}

export function parseRecommendationSourceBody(body: JsonRecord): RecommendationSource {
  const source = requireString(body, "source");
  if (!isRecommendationSource(source)) {
    throw badRequest(`Unknown recommendation source: ${source}`);
  }
  return source;
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

export interface HttpConnectionInputFields {
  protocol?: "http" | "https";
  port?: number;
  basePath?: string;
}

export function assignOptionalHttpConnectionFields(input: HttpConnectionInputFields, body: JsonRecord): void {
  const protocol = optionalString(body, "protocol");
  if (protocol !== undefined) {
    input.protocol = requireHttpConnectionProtocol(protocol);
  }
  if (body.port !== undefined) {
    input.port = requireNumber(body, "port");
  }
  const basePath = optionalString(body, "basePath");
  if (basePath !== undefined) {
    input.basePath = basePath;
  }
}

function requireHttpConnectionProtocol(protocol: string): "http" | "https" {
  if (protocol !== "http" && protocol !== "https") {
    throw badRequest(`Unsupported protocol: ${protocol}`);
  }
  return protocol;
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

/** Retrieves Apple schema source documents from their allowlisted GitHub locations. */
import { APPLE_SCHEMA_SOURCE_PATHS, type AppleSchemaDocument } from "./apple-schema-catalog-storage.js";
import {
  appleSchemaGithubApiUrl,
  appleSchemaRawDocumentUrl,
  assertExpectedAppleSchemaDownloadUrl,
  fetchAppleSchemaUrl,
} from "./apple-schema-catalog-urls.js";
import { asRecord } from "../platform/serialization/json-guards.js";

const DEFAULT_APPLE_SCHEMA_REFRESH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_DIRECTORY_RESPONSE_BYTES = 1 * 1024 * 1024;
const DEFAULT_MAX_DOCUMENT_RESPONSE_BYTES = 1 * 1024 * 1024;
const DEFAULT_MAX_DIRECTORY_ENTRIES = 2_000;
const DEFAULT_MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_AGGREGATE_BODY_BYTES = 32 * 1024 * 1024;

interface RemoteDirectoryEntry {
  name: string;
  downloadUrl?: string;
}

interface RemoteDirectoryResponse {
  entries: RemoteDirectoryEntry[];
  byteLength: number;
}

export interface RemoteAppleSchemaOptions {
  timeoutMs?: number;
  maxDirectoryResponseBytes?: number;
  maxDocumentResponseBytes?: number;
  maxDirectoryEntries?: number;
  maxDocumentBytes?: number;
  maxAggregateBodyBytes?: number;
}

/** Retrieves the complete catalog under one deadline and aggregate input budget. */
export async function readRemoteAppleSchemaDocuments(
  revision: string,
  options: RemoteAppleSchemaOptions = {},
): Promise<AppleSchemaDocument[]> {
  const limits = remoteAppleSchemaLimits(options);
  const deadline = appleSchemaRefreshDeadline(limits.timeoutMs);
  const documents: AppleSchemaDocument[] = [];
  const errors: string[] = [];
  let directoryEntries = 0;
  let documentBytes = 0;
  let aggregateBodyBytes = 0;
  try {
    for (const source of APPLE_SCHEMA_SOURCE_PATHS) {
      const directory = await readRemoteAppleSchemaDirectory(source.path, revision, deadline.signal, limits.maxDirectoryResponseBytes);
      aggregateBodyBytes = addAggregateBodyBytes(aggregateBodyBytes, directory.byteLength, limits.maxAggregateBodyBytes);
      const files = directory.entries;
      directoryEntries += files.length;
      if (directoryEntries > limits.maxDirectoryEntries) {
        throw new Error(`Apple schema refresh exceeds ${String(limits.maxDirectoryEntries)} directory entries`);
      }
      for (const file of files) {
        if (!file.name.endsWith(".yaml") || file.downloadUrl === undefined) continue;
        const url = appleSchemaRawDocumentUrl(source.path, file.name, revision);
        assertExpectedAppleSchemaDownloadUrl(file.downloadUrl, url);
        const response = await fetchAppleSchemaUrl(url, deadline.signal, limits.maxDocumentResponseBytes);
        const body = await readAppleSchemaResponseBody(response);
        aggregateBodyBytes = addAggregateBodyBytes(aggregateBodyBytes, body.byteLength, limits.maxAggregateBodyBytes);
        if (!response.ok) {
          errors.push(`Failed to fetch ${url.href}: ${response.status} ${response.statusText}`);
          continue;
        }
        const content = body.text;
        documentBytes += body.byteLength;
        if (documentBytes > limits.maxDocumentBytes) {
          throw new Error(`Apple schema refresh exceeds ${String(limits.maxDocumentBytes)} document bytes`);
        }
        documents.push({ kind: source.kind, path: `${source.path}/${file.name}`, content });
      }
    }
    if (errors.length > 0) throw new Error(`Failed to fetch ${errors.length} Apple schema document(s):\n${errors.join("\n")}`);
    return documents;
  } finally {
    deadline.dispose();
  }
}

async function readRemoteAppleSchemaDirectory(
  path: string,
  revision: string,
  signal: AbortSignal,
  maxResponseBytes: number,
): Promise<RemoteDirectoryResponse> {
  const response = await fetchAppleSchemaUrl(appleSchemaGithubApiUrl(path, revision), signal, maxResponseBytes);
  if (!response.ok) throw new Error(`Failed to list Apple schema path ${path}: ${response.status} ${response.statusText}`);
  const body = await readAppleSchemaResponseBody(response);
  const parsed = JSON.parse(body.text) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`Unexpected GitHub directory response for ${path}`);
  return { entries: parsed.map(toRemoteDirectoryEntry).filter((entry) => entry.name.length > 0), byteLength: body.byteLength };
}

function toRemoteDirectoryEntry(value: unknown): RemoteDirectoryEntry {
  const record = asRecord(value) ?? {};
  const name = typeof record.name === "string" ? record.name : "";
  const downloadUrl = typeof record.download_url === "string" ? record.download_url : undefined;
  return downloadUrl === undefined ? { name } : { name, downloadUrl };
}

function remoteAppleSchemaLimits(options: RemoteAppleSchemaOptions): Required<RemoteAppleSchemaOptions> {
  return {
    timeoutMs: positiveSafeInteger(options.timeoutMs ?? DEFAULT_APPLE_SCHEMA_REFRESH_TIMEOUT_MS, "Apple schema refresh timeout"),
    maxDirectoryResponseBytes: positiveSafeInteger(options.maxDirectoryResponseBytes ?? DEFAULT_MAX_DIRECTORY_RESPONSE_BYTES, "Apple schema directory response limit"),
    maxDocumentResponseBytes: positiveSafeInteger(options.maxDocumentResponseBytes ?? DEFAULT_MAX_DOCUMENT_RESPONSE_BYTES, "Apple schema document response limit"),
    maxDirectoryEntries: positiveSafeInteger(options.maxDirectoryEntries ?? DEFAULT_MAX_DIRECTORY_ENTRIES, "Apple schema directory entry limit"),
    maxDocumentBytes: positiveSafeInteger(options.maxDocumentBytes ?? DEFAULT_MAX_DOCUMENT_BYTES, "Apple schema document limit"),
    maxAggregateBodyBytes: positiveSafeInteger(options.maxAggregateBodyBytes ?? DEFAULT_MAX_AGGREGATE_BODY_BYTES, "Apple schema aggregate body limit"),
  };
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function appleSchemaRefreshDeadline(timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Apple schema refresh exceeded ${String(timeoutMs)}ms`)), timeoutMs);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

async function readAppleSchemaResponseBody(response: Response): Promise<{ text: string; byteLength: number }> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { text: new TextDecoder().decode(bytes), byteLength: bytes.byteLength };
}

function addAggregateBodyBytes(total: number, next: number, maximum: number): number {
  const result = total + next;
  if (result > maximum) throw new Error(`Apple schema refresh exceeds ${String(maximum)} aggregate body bytes`);
  return result;
}

/** Reads bounded JSON request bodies and supplies parsed bodies to queued handlers. */
import type { IncomingMessage } from "node:http";
import { badRequest, HttpError, type JsonRecord } from "./editor-http-error.js";
import { assertJsonShapeWithinLimits } from "./editor-json-shape-limits.js";
import { decodeStrictUtf8 } from "../platform/serialization/strict-utf8.js";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;
export const LARGE_JSON_BODY_LIMIT_BYTES = 64 * 1024 * 1024;

export type JsonBodyOutcome =
  | { readonly ok: true; readonly body: JsonRecord }
  | { readonly ok: false; readonly error: unknown };

const suppliedBodies = new WeakMap<IncomingMessage, JsonBodyOutcome>();

/** Caps both body bytes and JSON shape to bound work before route validation. */
export async function readJsonBody(request: IncomingMessage, limitBytes = DEFAULT_JSON_BODY_LIMIT_BYTES): Promise<JsonRecord> {
  const supplied = suppliedBodies.get(request);
  if (supplied?.ok === true) return supplied.body;
  if (supplied !== undefined) throw supplied.error;
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
  let text: string;
  try {
    text = decodeStrictUtf8(Buffer.concat(chunks), "JSON body");
  } catch {
    throw badRequest("Invalid UTF-8 JSON body");
  }
  assertJsonShapeWithinLimits(text);
  return parseJsonRecord(text);
}

/** Captures parse failures so handler-local preconditions retain their original order. */
export async function readJsonBodyOutcome(request: IncomingMessage, limitBytes: number): Promise<JsonBodyOutcome> {
  try {
    return { ok: true, body: await readJsonBody(request, limitBytes) };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Makes an intake-parsed body visible only while its existing route handler executes. */
export async function withParsedJsonBody<T>(
  request: IncomingMessage,
  outcome: JsonBodyOutcome,
  action: () => Promise<T> | T,
): Promise<T> {
  if (suppliedBodies.has(request)) throw new Error("Editor request body is already supplied");
  suppliedBodies.set(request, outcome);
  try {
    return await action();
  } finally {
    suppliedBodies.delete(request);
  }
}

function parseJsonRecord(text: string): JsonRecord {
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

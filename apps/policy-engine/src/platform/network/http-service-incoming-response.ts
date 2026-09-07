/** Converts bounded Node response messages into reusable Fetch Responses. */
import type { IncomingMessage } from "node:http";
import { httpServiceContentLength } from "./http-service-content-length.js";

export async function incomingMessageToResponse(incoming: IncomingMessage, maxResponseBytes: number): Promise<Response> {
  const declaredLength = httpServiceContentLength(incoming.headers["content-length"]);
  if (declaredLength !== undefined && declaredLength > maxResponseBytes) {
    incoming.destroy();
    throw responseLimitError(maxResponseBytes);
  }

  const bytes = await readResponseBytes(incoming, maxResponseBytes);
  return new Response(bytes.length === 0 ? null : new Uint8Array(bytes), {
    status: incoming.statusCode ?? 500,
    statusText: incoming.statusMessage ?? "",
    headers: responseHeaders(incoming),
  });
}

function responseHeaders(incoming: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(incoming.headers)) {
    appendHeaderValue(headers, name, rawValue);
  }
  return headers;
}

function appendHeaderValue(headers: Headers, name: string, rawValue: string | string[] | undefined): void {
  if (Array.isArray(rawValue)) {
    for (const value of rawValue) headers.append(name, value);
    return;
  }
  if (rawValue !== undefined) headers.append(name, rawValue);
}

async function readResponseBytes(incoming: IncomingMessage, maxResponseBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of incoming) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxResponseBytes) {
      incoming.destroy();
      throw responseLimitError(maxResponseBytes);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function responseLimitError(maxResponseBytes: number): Error {
  return new Error(`HTTP service response exceeds ${String(maxResponseBytes)} bytes`);
}

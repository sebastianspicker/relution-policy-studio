/** Bounds Fetch response bodies after Node transport has established the connection. */
import { waitForAbort } from "./http-service-abort.js";
import { httpServiceContentLength } from "./http-service-content-length.js";

export async function responseWithinLimit(
  response: Response,
  maxResponseBytes: number,
  serviceName: string,
  signal: AbortSignal,
): Promise<Response> {
  if (signal.aborted) {
    void response.body?.cancel(signal.reason).catch(() => undefined);
    throw signal.reason;
  }
  const declaredLength = httpServiceContentLength(response.headers.get("content-length"));
  if (declaredLength !== undefined && declaredLength > maxResponseBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw serviceResponseLimitError(serviceName, maxResponseBytes);
  }
  if (response.body === null) {
    return response;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await readWithAbort(reader, signal);
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > maxResponseBytes) {
        const error = serviceResponseLimitError(serviceName, maxResponseBytes);
        await reader.cancel(error).catch(() => undefined);
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (signal.aborted) throw signal.reason;
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new Response(bytes.length === 0 ? null : bytes, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return await waitForAbort(reader.read(), signal, {
    onAbort: async (reason) => await reader.cancel(reason),
  });
}

function serviceResponseLimitError(serviceName: string, maxResponseBytes: number): Error {
  return new Error(`${serviceName} API response exceeds ${String(maxResponseBytes)} bytes`);
}

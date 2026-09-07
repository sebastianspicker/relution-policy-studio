/** Prepares bounded request bodies and framing for the pinned Node transport. */

/** Internal seam used to enforce the production adapter's body and framing contract. */
export function preparePinnedHttpServiceRequest(
  url: URL,
  init: RequestInit,
): { body: Buffer | undefined; headers: Headers } {
  const body = requestBodyBuffer(init.body);
  const headers = new Headers(init.headers);
  headers.set("host", url.host);
  headers.set("accept-encoding", "identity");
  for (const name of ["connection", "transfer-encoding", "trailer", "upgrade"]) {
    headers.delete(name);
  }
  if (body === undefined) {
    headers.delete("content-length");
  } else {
    headers.set("content-length", String(body.length));
  }
  return { body, headers };
}

function assertSupportedHttpServiceRequestBody(
  body: BodyInit | null | undefined,
): void {
  requestBodyByteLength(body);
}

/** Rejects oversized buffered request payloads before DNS resolution or I/O. */
export function assertHttpServiceRequestBodyWithinLimit(
  body: BodyInit | null | undefined,
  maxRequestBytes: number,
): void {
  if (requestBodyByteLength(body) > maxRequestBytes) {
    throw new Error(`HTTP service request body exceeds ${String(maxRequestBytes)} bytes`);
  }
}

function requestBodyByteLength(body: BodyInit | null | undefined): number {
  if (
    body === undefined
    || body === null
  ) {
    return 0;
  }
  if (typeof body === "string") return Buffer.byteLength(body);
  if (body instanceof URLSearchParams) return Buffer.byteLength(body.toString());
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  throw unsupportedRequestBodyError();
}

function requestBodyBuffer(body: BodyInit | null | undefined): Buffer | undefined {
  assertSupportedHttpServiceRequestBody(body);
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw unsupportedRequestBodyError();
}

function unsupportedRequestBodyError(): Error {
  return new Error("HTTP service request body must be a buffered string, URLSearchParams, ArrayBuffer, or ArrayBuffer view");
}

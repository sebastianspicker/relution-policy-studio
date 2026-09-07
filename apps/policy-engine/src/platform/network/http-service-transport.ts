/** Provides bounded HTTP(S) transport for external service integrations. */
import type { NormalizedConnectionBase } from "./connection-normalization.js";
import { resolveAllowedServiceAddresses, type ResolvedServiceAddress } from "./outbound-host-policy.js";
import { waitForAbort } from "./http-service-abort.js";
import {
  assertHttpServiceRequestBodyWithinLimit,
} from "./http-service-node-adapter.js";
import { requestPinnedHttpServiceUrl } from "./http-service-pinned-request.js";
import { responseWithinLimit } from "./http-service-response.js";
import { httpServiceRequestDeadline } from "./http-service-deadline.js";
import { assertHttpServiceUrl } from "./http-service-url-validation.js";
import { isHttpServiceRedirectStatus, positiveHttpServiceSafeInteger } from "./http-service-transport-validation.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_REQUEST_LIMIT_BYTES = 16 * 1024 * 1024;
const DEFAULT_RESPONSE_LIMIT_BYTES = 16 * 1024 * 1024;

export interface HttpServiceTransportAdapter {
  resolveAddresses: (
    serviceName: string,
    hostname: string,
    allowLocalServiceHosts: boolean,
    signal?: AbortSignal,
  ) => Promise<ResolvedServiceAddress[]>;
  request: (
    url: URL,
    init: RequestInit,
    addresses: readonly ResolvedServiceAddress[],
    maxResponseBytes: number,
  ) => Promise<Response>;
}

export interface HttpServiceTransportOptions {
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  adapter?: HttpServiceTransportAdapter;
}

const secureTransportAdapter: HttpServiceTransportAdapter = {
  resolveAddresses: async (serviceName, hostname, allowLocalServiceHosts) =>
    await resolveAllowedServiceAddresses(serviceName, hostname, allowLocalServiceHosts),
  request: requestPinnedHttpServiceUrl,
};

export { httpServiceRequestUrl } from "./http-service-url.js";

/**
 * Uses the validated service transport rather than allowing an arbitrary fetch sink.
 * Request bodies are limited to buffered strings, URLSearchParams, ArrayBuffers,
 * and ArrayBuffer views; streamed, Blob, and FormData bodies are rejected.
 */
export async function fetchHttpServiceUrl(
  connection: NormalizedConnectionBase,
  url: URL,
  init: RequestInit,
  serviceName: string,
  options: HttpServiceTransportOptions = {},
): Promise<Response> {
  assertHttpServiceUrl(connection, url, serviceName);
  const maxRequestBytes = positiveHttpServiceSafeInteger(options.maxRequestBytes ?? DEFAULT_REQUEST_LIMIT_BYTES, "HTTP service request limit");
  assertHttpServiceRequestBodyWithinLimit(init.body, maxRequestBytes);
  const timeoutMs = positiveHttpServiceSafeInteger(options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, "HTTP service request timeout");
  const maxResponseBytes = positiveHttpServiceSafeInteger(options.maxResponseBytes ?? DEFAULT_RESPONSE_LIMIT_BYTES, "HTTP service response limit");
  const adapter = options.adapter ?? secureTransportAdapter;
  const deadline = httpServiceRequestDeadline(init.signal, timeoutMs);
  try {
    const addresses = await waitForAbort(
      adapter.resolveAddresses(serviceName, url.hostname, connection.allowLocalServiceHosts, deadline.signal),
      deadline.signal,
    );
    if (addresses.length === 0) {
      throw new Error(`${serviceName} host resolution returned no approved addresses`);
    }
    const requestInit: RequestInit = {
      ...init,
      redirect: "manual",
      signal: deadline.signal,
    };
    const response = await waitForAbort(
      adapter.request(url, requestInit, addresses, maxResponseBytes),
      deadline.signal,
      { disposeLateValue: cancelResponseBody },
    );
    if (isHttpServiceRedirectStatus(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`${serviceName} API redirects are not allowed`);
    }
    return await responseWithinLimit(response, maxResponseBytes, serviceName, deadline.signal);
  } finally {
    deadline.dispose();
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

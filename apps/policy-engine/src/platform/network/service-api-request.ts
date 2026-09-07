/** Shares the validated request envelope used by external service API clients. */
import type { NormalizedConnectionBase } from "./connection-normalization.js";
import {
  fetchHttpServiceUrl,
  httpServiceRequestUrl,
  type HttpServiceTransportOptions,
} from "./http-service-transport.js";

export interface ServiceApiRequestOptions {
  connection: NormalizedConnectionBase;
  serviceName: string;
  path: string;
  init: RequestInit;
  transportOptions: HttpServiceTransportOptions;
  serviceHeaders: Record<string, string>;
  createNetworkError: (message: string, cause: unknown) => Error;
  query?: URLSearchParams;
}

/** Creates service-specific named network errors for API clients. */
export function createServiceNetworkError(name: string): (message: string, cause: unknown) => Error {
  return (message, cause) => {
    const error = new Error(message, { cause });
    error.name = name;
    return error;
  };
}

/**
 * Builds a request inside the configured service root, uses the pinned transport,
 * and keeps failed responses free of remote response bodies.
 */
export async function fetchServiceApi(options: ServiceApiRequestOptions): Promise<Response> {
  const { connection, serviceName, path, init, transportOptions, serviceHeaders, createNetworkError, query } = options;
  const url = httpServiceRequestUrl(connection, path, serviceName);
  if (query !== undefined) url.search = query.toString();
  let response: Response;
  try {
    response = await fetchHttpServiceUrl(connection, url, {
      ...init,
      headers: serviceRequestHeaders(init.headers, serviceHeaders),
    }, serviceName, transportOptions);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw createNetworkError(`${serviceName} API request failed before an HTTP response: ${detail}`, error);
  }
  if (!response.ok) {
    throw new Error(`${serviceName} API request failed: ${String(response.status)} ${response.statusText}`);
  }
  return response;
}

function serviceRequestHeaders(headers: HeadersInit | undefined, serviceHeaders: Record<string, string>): Record<string, string> {
  const merged = Object.fromEntries(new Headers(headers).entries());
  for (const [name, value] of Object.entries(serviceHeaders)) {
    for (const existingName of Object.keys(merged)) {
      if (existingName.toLowerCase() === name.toLowerCase()) delete merged[existingName];
    }
    merged[name] = value;
  }
  return merged;
}

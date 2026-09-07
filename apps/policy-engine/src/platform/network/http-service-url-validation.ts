/** Validates service paths and reports outbound URL boundary violations safely. */
import type { NormalizedConnectionBase } from "./connection-normalization.js";
import { isConfiguredHttpServiceUrl } from "./http-service-url-policy.js";

export function assertHttpServiceUrl(connection: NormalizedConnectionBase, url: URL, serviceName: string): void {
  assertHttpServicePath(connection.basePath, serviceName);
  assertHttpServicePath(url.pathname, serviceName);
  if (!isConfiguredHttpServiceUrl(connection, url)) throw outsideConfiguredServiceRootError(serviceName, "URL");
}

export function assertHttpServicePath(path: string, serviceName: string): void {
  if (!path.startsWith("/") && path.length > 0 || /(?:^|\/)(?:\.|\.\.)(?:\/|$)/u.test(path) || /%2e|%2f|%5c/iu.test(path)) {
    throw new Error(`${serviceName} API path contains an unsafe path segment`);
  }
}

export function outsideConfiguredServiceRootError(serviceName: string, subject: "path" | "URL"): Error {
  return new Error(`${serviceName} API ${subject} resolves outside configured service root`);
}

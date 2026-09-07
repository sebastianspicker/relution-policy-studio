/** Constructs validated service URLs below the configured connection root. */
import { formatHttpUrlAuthority, type NormalizedConnectionBase } from "./connection-normalization.js";
import { isConfiguredHttpServiceUrl } from "./http-service-url-policy.js";
import { assertHttpServicePath, outsideConfiguredServiceRootError } from "./http-service-url-validation.js";

export function httpServiceRequestUrl(connection: NormalizedConnectionBase, path: string, serviceName: string): URL {
  assertHttpServicePath(connection.basePath, serviceName);
  assertHttpServicePath(path, serviceName);
  const origin = `${connection.protocol}://${formatHttpUrlAuthority(connection.host, connection.port)}`;
  const url = new URL(`${connection.basePath}${path}`, origin);
  if (!isConfiguredHttpServiceUrl(connection, url) || url.pathname !== `${connection.basePath}${path}`) {
    throw outsideConfiguredServiceRootError(serviceName, "path");
  }
  return url;
}

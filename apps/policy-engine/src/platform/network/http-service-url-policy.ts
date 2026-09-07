/** Compares an outbound URL against the normalized service connection boundary. */
import { normalizeHttpHostname, type NormalizedConnectionBase } from "./connection-normalization.js";

export function isConfiguredHttpServiceUrl(connection: NormalizedConnectionBase, url: URL): boolean {
  return (
    url.protocol === `${connection.protocol}:`
    && normalizedUrlHostname(url.hostname) === normalizeHttpHostname(connection.host)
    && url.port === expectedUrlPort(connection.protocol, connection.port)
    && url.username.length === 0
    && url.password.length === 0
    && isWithinBasePath(url.pathname, connection.basePath)
  );
}

function normalizedUrlHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/u, "$1");
}

function isWithinBasePath(pathname: string, basePath: string): boolean {
  return basePath.length === 0 || pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function expectedUrlPort(protocol: NormalizedConnectionBase["protocol"], port: number | undefined): string {
  if (port === undefined || (protocol === "https" && port === 443) || (protocol === "http" && port === 80)) return "";
  return String(port);
}

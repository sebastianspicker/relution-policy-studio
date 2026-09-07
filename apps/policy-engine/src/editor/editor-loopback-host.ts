/** Normalizes loopback names independently from inbound HTTP authority parsing. */
import { isIP } from "node:net";
import { formatHttpUrlAuthority } from "../platform/network/connection-normalization.js";

export function assertSafeEditorHost(host: string, _legacyAllowNetworkHost = false): void {
  if (isLoopbackHostname(normalizeHostname(host))) return;
  throw new Error(`Non-loopback editor host "${host}" is not supported because the editor transport is local HTTP`);
}

export function editorUrlWithNetworkToken(host: string, port: number, token: string | undefined): string {
  const baseUrl = `http://${formatHttpUrlAuthority(host, port)}/`;
  return token === undefined ? baseUrl : `${baseUrl}#editorToken=${encodeURIComponent(token)}`;
}

export function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/u, "$1");
}

export function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;
  const normalized = normalizeHostname(hostname);
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  return isIP(mappedIpv4 ?? normalized) === 4 && (mappedIpv4 ?? normalized).startsWith("127.");
}

export function normalizedUrlHost(url: URL): string {
  const hostname = normalizeHostname(url.hostname);
  const host = hostname.includes(":") ? `[${hostname}]` : hostname;
  return url.port.length === 0 || (url.protocol === "http:" && url.port === "80") ? host : `${host}:${url.port}`;
}

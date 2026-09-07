/** Validates loopback request authorities without URL-normalizing malformed input. */
import type { IncomingMessage } from "node:http";
import { HttpError } from "./editor-http-error.js";
import { isLoopbackHostname, normalizeHostname, normalizedUrlHost } from "./editor-loopback-host.js";

export interface SafeApiRequestHost {
  readonly host: string;
  readonly hostname: string;
}

export function requireLoopbackRequestHost(request: IncomingMessage, label: string): SafeApiRequestHost {
  const host = firstHeaderValue(request.headers.host);
  if (host === undefined || host.trim().length === 0) {
    throw new HttpError(400, `${label} require a Host header`);
  }
  const parsed = parseHostAuthority(host);
  const hostname = normalizeHostname(parsed.hostname);
  if (!isLoopbackHostname(hostname)) {
    throw new HttpError(403, `${label} require a loopback Host header`);
  }
  return { host: normalizedUrlHost(parsed), hostname };
}

export function assertSameOrigin(request: IncomingMessage, requestHost: string): void {
  const origin = firstHeaderValue(request.headers.origin);
  if (origin === undefined || origin.length === 0) return;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(403, `Invalid Origin header: ${origin}`);
  }
  if (!isStrictHttpOrigin(origin, parsed) || normalizedUrlHost(parsed) !== requestHost) {
    throw new HttpError(403, `Mutating editor API requests require same-origin requests: ${origin}`);
  }
}

function parseHostAuthority(host: string): URL {
  if (host !== host.trim() || /[/?#@]/u.test(host)) {
    throw new HttpError(400, `Invalid Host header: ${host}`);
  }
  try {
    const parsed = new URL(`http://${host}`);
    if (parsed.username.length > 0 || parsed.password.length > 0 || parsed.pathname !== "/" || parsed.search.length > 0 || parsed.hash.length > 0 || parsed.hostname.length === 0) {
      throw new Error("invalid authority");
    }
    return parsed;
  } catch {
    throw new HttpError(400, `Invalid Host header: ${host}`);
  }
}

function isStrictHttpOrigin(origin: string, parsed: URL): boolean {
  return parsed.protocol === "http:" && parsed.username.length === 0 && parsed.password.length === 0
    && parsed.pathname === "/" && parsed.search.length === 0 && parsed.hash.length === 0 && origin === parsed.origin;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

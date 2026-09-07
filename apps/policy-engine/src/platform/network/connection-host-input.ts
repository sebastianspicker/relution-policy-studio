/** Parses URL-like host input and formats canonical HTTP authorities. */
import { isIP } from "node:net";
import type { HttpProtocol } from "./connection-normalization-types.js";

export interface ParsedHostInput {
  protocol?: HttpProtocol;
  host: string;
  port?: number;
  basePath?: string;
}

export function parseHostInput(value: string): ParsedHostInput {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { host: "" };
  return parseExplicitHttpUrl(trimmed) ?? parseFallbackHost(trimmed);
}

export function formatHttpUrlAuthority(host: string, port?: number): string {
  const normalizedHost = normalizeHttpHostname(host);
  const authorityHost = isIP(normalizedHost) === 6 ? `[${normalizedHost}]` : normalizedHost;
  return port === undefined ? authorityHost : `${authorityHost}:${String(port)}`;
}

export function normalizeHttpHostname(host: string): string {
  return host.replace(/^\[(.*)\]$/u, "$1");
}

export function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/gu, "")}`;
}

function parseExplicitHttpUrl(value: string): ParsedHostInput | undefined {
  if (!/^https?:\/\//iu.test(value)) return undefined;
  try {
    return parsedHostInput(new URL(value), true);
  } catch {
    return fallbackHostInput(value);
  }
}

function parseFallbackHost(value: string): ParsedHostInput {
  try {
    return parsedHostInput(new URL(`https://${value}`), false);
  } catch {
    return fallbackHostInput(value);
  }
}

function parsedHostInput(url: URL, includeProtocol: boolean): ParsedHostInput {
  const protocol = url.protocol === "http:" ? "http" : url.protocol === "https:" ? "https" : undefined;
  const port = url.port.length === 0 ? undefined : Number(url.port);
  const basePath = url.pathname === "/" ? undefined : url.pathname;
  return {
    ...(includeProtocol && protocol !== undefined ? { protocol } : {}),
    host: url.hostname,
    ...(port === undefined ? {} : { port }),
    ...(basePath === undefined ? {} : { basePath }),
  };
}

function fallbackHostInput(value: string): ParsedHostInput {
  return { host: value.replace(/^https?:\/\//iu, "").replace(/\/.*$/u, "") };
}

export type HttpProtocol = "http" | "https";

export interface NormalizedConnectionBase {
  protocol: HttpProtocol;
  host: string;
  port?: number;
  basePath: string;
  baseUrl: string;
}

export function normalizeHttpConnectionInput(input: {
  readonly protocol?: HttpProtocol;
  readonly host: string;
  readonly port?: number;
  readonly basePath?: string;
  readonly serviceName: string;
}): NormalizedConnectionBase {
  const parsed = parseHostInput(input.host);
  const protocol = input.protocol ?? parsed.protocol ?? "https";
  assertHttpProtocol(protocol, input.serviceName);
  const host = parsed.host;
  if (host.length === 0) {
    throw new Error(`${input.serviceName} host is required`);
  }
  const basePath = normalizeBasePath(input.basePath ?? parsed.basePath ?? "");
  const port = input.port ?? parsed.port;
  assertOptionalPort(port, input.serviceName);
  const authority = port === undefined ? host : `${host}:${String(port)}`;
  return { protocol, host, ...(port === undefined ? {} : { port }), basePath, baseUrl: `${protocol}://${authority}${basePath}` };
}

function assertHttpProtocol(protocol: string, serviceName: string): asserts protocol is HttpProtocol {
  if (protocol !== "http" && protocol !== "https") {
    throw new Error(`Unsupported ${serviceName} protocol: ${String(protocol)}`);
  }
}

function assertOptionalPort(port: number | undefined, serviceName: string): void {
  if (port !== undefined && (!Number.isSafeInteger(port) || port < 1 || port > 65535)) {
    throw new Error(`Invalid ${serviceName} port: ${String(port)}`);
  }
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }
  return `/${trimmed.replace(/^\/+|\/+$/gu, "")}`;
}

function parseHostInput(value: string): { protocol?: HttpProtocol; host: string; port?: number; basePath?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { host: "" };
  }
  const urlText = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(urlText);
    const protocol = parsed.protocol === "http:" ? "http" : parsed.protocol === "https:" ? "https" : undefined;
    const port = parsed.port.length === 0 ? undefined : Number(parsed.port);
    const basePath = parsed.pathname === "/" ? undefined : parsed.pathname;
    return {
      ...(protocol === undefined || !/^https?:\/\//iu.test(trimmed) ? {} : { protocol }),
      host: parsed.hostname,
      ...(port === undefined ? {} : { port }),
      ...(basePath === undefined ? {} : { basePath }),
    };
  } catch {
    return { host: trimmed.replace(/^https?:\/\//iu, "").replace(/\/.*$/u, "") };
  }
}

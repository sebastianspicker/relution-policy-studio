/** Normalizes user-provided HTTP connection details before outbound use. */
import {
  formatHttpUrlAuthority,
  normalizeBasePath,
  normalizeHttpHostname,
  parseHostInput,
} from "./connection-host-input.js";
import type { HttpProtocol, NormalizedConnectionBase } from "./connection-normalization-types.js";

export type { HttpProtocol, NormalizedConnectionBase } from "./connection-normalization-types.js";
export { formatHttpUrlAuthority, normalizeHttpHostname } from "./connection-host-input.js";

export class HttpConnectionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpConnectionInputError";
  }
}

/** Accepts either host fields or URL-like input, then produces one canonical authority. */
export function normalizeHttpConnectionInput(input: {
  readonly protocol?: HttpProtocol;
  readonly host: string;
  readonly port?: number;
  readonly basePath?: string;
  readonly allowLocalServiceHosts?: boolean;
  readonly serviceName: string;
}): NormalizedConnectionBase {
  const parsed = parseHostInput(input.host);
  const protocol = input.protocol ?? parsed.protocol ?? "https";
  assertHttpProtocol(protocol, input.serviceName);
  const host = normalizeHttpHostname(parsed.host);
  if (host.length === 0) {
    throw new HttpConnectionInputError(`${input.serviceName} host is required`);
  }
  const basePath = normalizeBasePath(input.basePath ?? parsed.basePath ?? "");
  const port = input.port ?? parsed.port;
  assertOptionalPort(port, input.serviceName);
  const authority = formatHttpUrlAuthority(host, port);
  return {
    protocol,
    host,
    ...(port === undefined ? {} : { port }),
    basePath,
    baseUrl: `${protocol}://${authority}${basePath}`,
    allowLocalServiceHosts: input.allowLocalServiceHosts === true,
  };
}

function assertHttpProtocol(protocol: string, serviceName: string): asserts protocol is HttpProtocol {
  if (protocol !== "http" && protocol !== "https") {
    throw new HttpConnectionInputError(`Unsupported ${serviceName} protocol: ${String(protocol)}`);
  }
}

function assertOptionalPort(port: number | undefined, serviceName: string): void {
  if (port !== undefined && (!Number.isSafeInteger(port) || port < 1 || port > 65535)) {
    throw new HttpConnectionInputError(`Invalid ${serviceName} port: ${String(port)}`);
  }
}

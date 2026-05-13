import { badRequest, optionalString, requireNumber } from "./editor-server-helpers.js";

export type HttpProtocol = "http" | "https";

export function optionalHttpProtocol(body: Record<string, unknown>): HttpProtocol | undefined {
  const protocol = optionalString(body, "protocol");
  if (protocol === undefined) {
    return undefined;
  }
  if (protocol !== "http" && protocol !== "https") {
    throw badRequest(`Unsupported protocol: ${protocol}`);
  }
  return protocol;
}

export function optionalPort(body: Record<string, unknown>): number | undefined {
  return body.port === undefined ? undefined : requireNumber(body, "port");
}

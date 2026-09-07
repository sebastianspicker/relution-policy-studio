/** Parses optional connection fields without silently discarding invalid input. */
import { badRequest, type JsonRecord } from "./editor-http-error.js";
import { optionalString, requireNumber } from "./editor-api-request-input.js";

export interface HttpConnectionInputFields {
  protocol?: "http" | "https";
  port?: number;
  basePath?: string;
}

export function assignOptionalHttpConnectionFields(input: HttpConnectionInputFields, body: JsonRecord): void {
  const protocol = optionalString(body, "protocol");
  if (protocol !== undefined) input.protocol = requireHttpConnectionProtocol(protocol);
  if (body.port !== undefined) input.port = requireNumber(body, "port");
  const basePath = optionalString(body, "basePath");
  if (basePath !== undefined) input.basePath = basePath;
}

function requireHttpConnectionProtocol(protocol: string): "http" | "https" {
  if (protocol !== "http" && protocol !== "https") {
    throw badRequest(`Unsupported protocol: ${protocol}`);
  }
  return protocol;
}

/** Builds and validates Relution connection options from CLI arguments. */
import { normalizeRelutionConnection } from "../../integrations/relution/relution-connection.js";
import type { RelutionConnectionInput, RelutionProtocol } from "../../integrations/relution/relution-api-types.js";
import { optionalInteger, optionalString, type RelutionCliArgs } from "./relution-cli-options.js";

export function connectionFromArgs(args: RelutionCliArgs): ReturnType<typeof normalizeRelutionConnection> {
  const input: RelutionConnectionInput = {
    host: requireString(args, "host", "Missing --host <relution-host> or RELUTION_BASE_URL"),
    apiToken: requireString(args, "token", "Missing --token <api-token> or RELUTION_ACCESS_TOKEN"),
    allowLocalServiceHosts: args.options["allow-local-service-hosts"] === true,
  };
  const protocol = optionalProtocol(args);
  const port = optionalInteger(args, "port");
  const basePath = optionalString(args, "base-path");
  if (protocol !== undefined) input.protocol = protocol;
  if (port !== undefined) input.port = port;
  if (basePath !== undefined) input.basePath = basePath;
  return normalizeRelutionConnection(input);
}

function optionalProtocol(args: RelutionCliArgs): RelutionProtocol | undefined {
  const protocol = optionalString(args, "protocol");
  if (protocol === undefined) return undefined;
  if (protocol !== "http" && protocol !== "https") throw new Error(`Unsupported protocol: ${protocol}`);
  return protocol;
}

function requireString(args: RelutionCliArgs, name: string, message: string): string {
  const value = optionalString(args, name) ?? envFallback(name);
  if (value === undefined || value.length === 0) throw new Error(message);
  return value;
}

function envFallback(name: string): string | undefined {
  if (name === "host") return process.env.RELUTION_BASE_URL;
  if (name === "token") return process.env.RELUTION_ACCESS_TOKEN;
  return undefined;
}

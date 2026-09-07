// Normalizes Relution connection inputs and exposes redacted public session state.
import { HttpConnectionInputError, normalizeHttpConnectionInput } from "../../platform/network/connection-normalization.js";
import type { RelutionConnection, RelutionConnectionInput, RelutionPublicSession } from "./relution-api-types.js";

export function normalizeRelutionConnection(input: RelutionConnectionInput): RelutionConnection {
  const apiToken = input.apiToken.trim();
  if (apiToken.length === 0) {
    throw new HttpConnectionInputError("Relution API token is required");
  }
  const connection = normalizeHttpConnectionInput({ ...input, serviceName: "Relution" });
  if (connection.protocol === "http" && !connection.allowLocalServiceHosts) {
    throw new HttpConnectionInputError("Relution HTTP connections require --allow-local-service-hosts; use HTTPS for remote services");
  }
  return {
    ...connection,
    apiToken,
    mode: "read-only",
  };
}

export function publicRelutionSession(connection: RelutionConnection | undefined): RelutionPublicSession {
  if (connection === undefined) {
    return { configured: false, tokenConfigured: false, mode: "read-only" };
  }
  return { configured: true, baseUrl: connection.baseUrl, tokenConfigured: connection.apiToken.length > 0, mode: "read-only" };
}

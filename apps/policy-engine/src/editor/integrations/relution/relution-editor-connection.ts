/** Validates Relution connection input before changing session state. */
import { HttpConnectionInputError } from "../../../platform/network/connection-normalization.js";
import { assignOptionalHttpConnectionFields } from "../../editor-connection-request-input.js";
import { requireString } from "../../editor-api-request-input.js";
import { badRequest } from "../../editor-http-error.js";
import { assertAllowedEditorServiceHost } from "../../editor-service-host-policy.js";
import type { HttpServiceTransportOptions } from "../../../platform/network/http-service-transport.js";
import { normalizeRelutionConnection } from "../../../integrations/relution/relution-connection.js";
import type { RelutionConnection, RelutionConnectionInput } from "../../../integrations/relution/relution-api-types.js";

export async function parseAllowedRelutionConnection(
  body: Record<string, unknown>,
  allowLocalServiceHosts: boolean,
  transportOptions: HttpServiceTransportOptions = {},
): Promise<RelutionConnection> {
  let connection: RelutionConnection;
  try {
    connection = normalizeRelutionConnection({ ...parseRelutionConnectionInput(body), allowLocalServiceHosts });
  } catch (error) {
    if (error instanceof HttpConnectionInputError) throw badRequest(error.message);
    throw error;
  }
  await assertAllowedEditorServiceHost("Relution", connection.host, allowLocalServiceHosts, transportOptions);
  return connection;
}

export function requireRelutionConnection<T extends { readonly connection?: RelutionConnection }>(runtime: T, allowLocalServiceHosts: boolean): RelutionConnection {
  if (runtime.connection === undefined) throw badRequest("Relution API session is not configured");
  return runtime.connection.allowLocalServiceHosts === allowLocalServiceHosts
    ? runtime.connection : { ...runtime.connection, allowLocalServiceHosts };
}

function parseRelutionConnectionInput(body: Record<string, unknown>): RelutionConnectionInput {
  const input: RelutionConnectionInput = { host: requireString(body, "host"), apiToken: requireString(body, "apiToken") };
  assignOptionalHttpConnectionFields(input, body);
  return input;
}

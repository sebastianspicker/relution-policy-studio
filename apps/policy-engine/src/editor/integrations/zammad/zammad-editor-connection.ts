/** Validates Zammad session input before it becomes active editor state. */
import { HttpConnectionInputError } from "../../../platform/network/connection-normalization.js";
import { badRequest } from "../../editor-http-error.js";
import { assertAllowedEditorServiceHost } from "../../editor-service-host-policy.js";
import type { HttpServiceTransportOptions } from "../../../platform/network/http-service-transport.js";
import { normalizeZammadConnection } from "../../../integrations/zammad/zammad-api-connection.js";
import type { ZammadConnection } from "../../../contracts/zammad.js";
import { parseZammadConnectionInput } from "./zammad-editor-input.js";

export async function parseAllowedZammadConnection(
  body: Record<string, unknown>,
  allowLocalServiceHosts: boolean,
  transportOptions: HttpServiceTransportOptions = {},
): Promise<ZammadConnection> {
  let connection: ZammadConnection;
  try {
    connection = normalizeZammadConnection({ ...parseZammadConnectionInput(body), allowLocalServiceHosts });
  } catch (error) {
    if (error instanceof HttpConnectionInputError) throw badRequest(error.message);
    throw error;
  }
  await assertAllowedEditorServiceHost("Zammad", connection.host, allowLocalServiceHosts, transportOptions);
  return connection;
}

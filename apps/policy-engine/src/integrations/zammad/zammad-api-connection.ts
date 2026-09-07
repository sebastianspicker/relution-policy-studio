/** Normalizes Zammad credentials and exposes its deliberately token-free session view. */
import { HttpConnectionInputError, normalizeHttpConnectionInput } from "../../platform/network/connection-normalization.js";
import type { ZammadConnection, ZammadConnectionInput, ZammadPublicSession } from "../../contracts/zammad.js";

export function normalizeZammadConnection(input: ZammadConnectionInput): ZammadConnection {
  const apiToken = requiredZammadText(input.apiToken, "Zammad API token");
  if (/[\u0000-\u001f\u007f]/u.test(apiToken)) {
    throw new HttpConnectionInputError("Zammad API token must not contain control characters");
  }
  const group = requiredZammadText(input.group, "Zammad group");
  const customer = requiredZammadText(input.customer, "Zammad customer");
  const connection = normalizeHttpConnectionInput({ ...input, serviceName: "Zammad" });
  if (connection.protocol === "http" && !connection.allowLocalServiceHosts) {
    throw new HttpConnectionInputError("Zammad HTTP connections require --allow-local-service-hosts; use HTTPS for remote services");
  }
  return { ...connection, apiToken, group, customer };
}

export function publicZammadSession(connection: ZammadConnection | undefined): ZammadPublicSession {
  if (connection === undefined) return { configured: false, tokenConfigured: false };
  return {
    configured: true,
    baseUrl: connection.baseUrl,
    tokenConfigured: connection.apiToken.length > 0,
    group: connection.group,
    customer: connection.customer,
  };
}

function requiredZammadText(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new HttpConnectionInputError(`${label} is required`);
  return normalized;
}

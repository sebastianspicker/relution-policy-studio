/** Normalizes dashboard JSON requests and external-connection response checks. */
import type { ZammadTicketResult } from "../../../../src/browser/integrations.js";
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import type { ConnectionTestResponse } from "./relution-dashboard-types.js";

export async function requestDashboardJson<T extends { readonly error?: string }>(url: string, body: unknown): Promise<T> {
  const response = await postJson(url, body);
  const result = await readJsonResponse<T>(response);
  if (!response.ok) throw new Error(result.error ?? JSON.stringify(result));
  return result;
}

export function connectionTestFailureMessage(result: ConnectionTestResponse): string {
  return result.reason ?? result.error ?? JSON.stringify(result);
}

function hasZammadTicketIdentifier(ticket: ZammadTicketResult): boolean {
  const hasNumber = typeof ticket.number === "string" && ticket.number.trim().length > 0;
  const hasId = typeof ticket.id === "number" && Number.isFinite(ticket.id);
  return hasNumber || hasId;
}

export function requiredZammadTicket(response: { readonly ticket?: ZammadTicketResult; readonly error?: string }): ZammadTicketResult {
  if (response.ticket === undefined || !hasZammadTicketIdentifier(response.ticket)) {
    throw new Error(response.error ?? "Zammad ticket creation returned no ticket id or number");
  }
  return response.ticket;
}

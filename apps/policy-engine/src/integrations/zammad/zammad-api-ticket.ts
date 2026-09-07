/** Tests Zammad authentication and creates internally visible ticket notes. */
import type { ZammadTicketDraft } from "../../contracts/zammad.js";
import type { HttpServiceTransportOptions } from "../../platform/network/http-service-transport.js";
import { strictResponseJson } from "../../platform/network/strict-response-json.js";
import type { ZammadConnection, ZammadConnectionTestResult, ZammadTicketResult } from "../../contracts/zammad.js";
import { zammadFetch } from "./zammad-api-request.js";
import { parseZammadTicketResult } from "./zammad-api-ticket-result.js";
import { asRecord } from "../../platform/serialization/json-guards.js";

export async function testZammadConnection(
  connection: ZammadConnection,
  transportOptions: HttpServiceTransportOptions = {},
): Promise<ZammadConnectionTestResult> {
  const response = await zammadFetch(connection, "/api/v1/users/me", { method: "GET" }, transportOptions);
  try {
    const raw = asRecord(await strictResponseJson(response, "Zammad connection test"));
    if (!isAuthenticatedZammadUser(raw)) throw new Error("invalid user");
  } catch {
    return {
      ok: false,
      baseUrl: connection.baseUrl,
      reason: "Zammad connection test returned an unexpected current-user response.",
    };
  }
  return { ok: true, baseUrl: connection.baseUrl };
}

export async function createZammadTicket(
  connection: ZammadConnection,
  draft: ZammadTicketDraft,
  transportOptions: HttpServiceTransportOptions = {},
  operationId?: string,
): Promise<ZammadTicketResult> {
  if (zammadDraftContainsOperationMarker(draft)) {
    throw new Error("Ticket draft title and body must not contain reserved Relution operation-marker lines");
  }
  const response = await zammadFetch(connection, "/api/v1/tickets", {
    method: "POST",
    body: JSON.stringify({
      title: draft.title,
      group: connection.group,
      customer: connection.customer,
      article: {
        subject: draft.title,
        body: operationId === undefined ? draft.body : `${draft.body}\n\n[relution-operation:${operationId}]`,
        type: "note",
        internal: true,
        content_type: "text/plain",
      },
    }),
  }, transportOptions);
  return parseZammadTicketResult(await strictResponseJson(response, "Zammad ticket creation"), connection, "Zammad ticket creation");
}

/** Prevents user text from impersonating the operation marker appended by this module. */
export function zammadDraftContainsOperationMarker(draft: Pick<ZammadTicketDraft, "title" | "body">): boolean {
  return [draft.title, draft.body].some((value) => value.split(/\r?\n/u).some(isZammadOperationMarkerLine));
}

export function isZammadOperationMarkerLine(line: string): boolean {
  return /^\[relution-operation:[^\]\r\n]*\]$/u.test(line);
}

function isAuthenticatedZammadUser(raw: Record<string, unknown> | undefined): boolean {
  return raw !== undefined
    && typeof raw.id === "number"
    && Number.isSafeInteger(raw.id)
    && raw.id > 0
    && typeof raw.login === "string"
    && raw.login.trim().length > 0;
}

/** Validates, canonicalizes, and reconciles persisted Zammad ticket identities. */
import type { ZammadConnection, ZammadTicketResult } from "../../contracts/zammad.js";
import { isValidZammadTicketNumber } from "./zammad-api-ticket-result.js";
import type { PersistedTicketResult } from "./zammad-operation-contract.js";

export function persistedResult(result: ZammadTicketResult): PersistedTicketResult {
  if (result.id === undefined && !isValidZammadTicketNumber(result.number)) throw new Error("Zammad ticket result has no persistable identifier");
  return { ...(result.id === undefined ? {} : { id: result.id }), ...(isValidZammadTicketNumber(result.number) ? { number: result.number } : {}) };
}

export function resultFromRecord(result: PersistedTicketResult, connection: ZammadConnection): ZammadTicketResult {
  if (result.id !== undefined) return { id: result.id, ...(result.number === undefined ? {} : { number: result.number }), url: `${connection.baseUrl}/#ticket/zoom/${String(result.id)}`, raw: {} };
  if (result.number !== undefined) return { number: result.number, raw: {} };
  throw new Error("Zammad operation record has no ticket identifier");
}

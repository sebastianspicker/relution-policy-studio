/** Validates and exposes only safe Zammad ticket identifiers and display fields. */
import type { ZammadConnection, ZammadTicketResult } from "../../contracts/zammad.js";

const MAX_ZAMMAD_TICKET_NUMBER_LENGTH = 256;

export function parseZammadTicketResult(rawValue: unknown, connection: ZammadConnection, label: string): ZammadTicketResult {
  if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) {
    throw new Error(`${label} returned a non-object response`);
  }
  const raw = rawValue as Record<string, unknown>;
  if (typeof raw.id === "number" && !isPositiveSafeInteger(raw.id)) {
    throw new Error(`${label} returned an id that must be a positive safe integer`);
  }
  const id = isPositiveSafeInteger(raw.id) ? raw.id : undefined;
  const number = isValidZammadTicketNumber(raw.number) ? raw.number : undefined;
  const title = typeof raw.title === "string" ? raw.title : undefined;
  const result = {
    ...(title === undefined ? {} : { title }),
    ...(id === undefined ? {} : { url: `${connection.baseUrl}/#ticket/zoom/${String(id)}` }),
    raw: {},
  };
  if (id !== undefined) return { ...result, id, ...(number === undefined ? {} : { number }) };
  if (number !== undefined) return { ...result, number };
  throw new Error(`${label} returned no ticket id or number`);
}

export function isValidZammadTicketNumber(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_ZAMMAD_TICKET_NUMBER_LENGTH;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

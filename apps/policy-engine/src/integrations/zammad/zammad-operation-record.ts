/** Parses strict on-disk Zammad operation record shapes. */
import { isValidZammadTicketNumber } from "./zammad-api-ticket-result.js";
import { OPERATION_VERSION, type PersistedOperation, type PersistedTicketResult } from "./zammad-operation-contract.js";
import { validOperationId } from "./zammad-operation-paths.js";

export function parseOperation(value: unknown, expectedId: string): PersistedOperation {
  if (!hasValidOperationHeader(value, expectedId)) throw new Error("Invalid Zammad operation record");
  if (isStartedOperation(value)) return { version: OPERATION_VERSION, id: expectedId, state: "started", updatedAt: value.updatedAt };
  if (isCompletedOperation(value)) return { version: OPERATION_VERSION, id: expectedId, state: "completed", updatedAt: value.updatedAt, result: parsePersistedResult(value.result) };
  throw new Error("Invalid Zammad operation record");
}

function parsePersistedResult(value: unknown): PersistedTicketResult {
  if (!isPersistedTicketResultRecord(value)) throw new Error("Invalid Zammad ticket result");
  const id = value.id;
  const number = value.number;
  validatePersistedTicketId(id);
  validatePersistedTicketNumber(number);
  if (identifiersAreMissing(id, number)) throw new Error("Missing Zammad ticket identifier");
  return ticketResultFrom(id, number);
}

function hasValidOperationHeader(value: unknown, expectedId: string): value is Record<string, unknown> & { updatedAt: string } {
  if (!isPlainRecord(value)) return false;
  if (value.version !== OPERATION_VERSION) return false;
  if (value.id !== expectedId) return false;
  if (!validOperationId(expectedId)) return false;
  return hasExactIsoDate(value.updatedAt);
}

function hasExactIsoDate(value: unknown): value is string {
  return typeof value === "string" && isExactIsoDate(value);
}

function isStartedOperation(value: Record<string, unknown>): boolean {
  if (value.state !== "started") return false;
  return Object.keys(value).length === 4;
}

function isCompletedOperation(value: Record<string, unknown>): boolean {
  if (value.state !== "completed") return false;
  return Object.keys(value).length === 5;
}

function isPersistedTicketResultRecord(value: unknown): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every(isPersistedTicketResultKey);
}

function isPersistedTicketResultKey(key: string): boolean {
  return key === "id" || key === "number";
}

function validatePersistedTicketId(value: unknown): void {
  if (value === undefined || isPositiveSafeInteger(value)) return;
  throw new Error("Invalid Zammad ticket id");
}

function isPositiveSafeInteger(value: unknown): value is number {
  if (typeof value !== "number") return false;
  if (!Number.isSafeInteger(value)) return false;
  return value > 0;
}

function validatePersistedTicketNumber(value: unknown): void {
  if (value === undefined || isValidZammadTicketNumber(value)) return;
  throw new Error("Invalid Zammad ticket number");
}

function identifiersAreMissing(id: unknown, number: unknown): boolean {
  return id === undefined && number === undefined;
}

function ticketResultFrom(id: unknown, number: unknown): PersistedTicketResult {
  return { ...(typeof id === "number" ? { id } : {}), ...(typeof number === "string" ? { number } : {}) };
}

function isExactIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** Merges only corroborating persisted Zammad ticket identities. */
import type { PersistedTicketResult } from "./zammad-operation-contract.js";

export function mergePersistedTicketResults(existing: PersistedTicketResult, incoming: PersistedTicketResult): PersistedTicketResult {
  const matchingId = sameDefinedIdentifier(existing.id, incoming.id);
  const matchingNumber = sameDefinedIdentifier(existing.number, incoming.number);
  if (conflictingDefinedIdentifier(existing.id, incoming.id)) throw conflictingTicketIdentifiers();
  if (conflictingDefinedIdentifier(existing.number, incoming.number)) throw conflictingTicketIdentifiers();
  if (!hasSharedIdentifier(matchingId, matchingNumber)) throw conflictingTicketIdentifiers();

  const result: PersistedTicketResult = {};
  const id = chooseExistingOrIncoming(existing.id, incoming.id);
  if (id !== undefined) result.id = id;
  const number = chooseExistingOrIncoming(existing.number, incoming.number);
  if (number !== undefined) result.number = number;
  return result;
}

function sameDefinedIdentifier<T>(existing: T | undefined, incoming: T | undefined): boolean {
  if (existing === undefined || incoming === undefined) return false;
  return existing === incoming;
}

function conflictingDefinedIdentifier<T>(existing: T | undefined, incoming: T | undefined): boolean {
  if (existing === undefined || incoming === undefined) return false;
  return existing !== incoming;
}

function hasSharedIdentifier(matchingId: boolean, matchingNumber: boolean): boolean {
  return matchingId || matchingNumber;
}

function chooseExistingOrIncoming<T>(existing: T | undefined, incoming: T | undefined): T | undefined {
  if (existing !== undefined) return existing;
  return incoming;
}

function conflictingTicketIdentifiers(): Error {
  return new Error("Zammad operation completed with conflicting ticket identifiers");
}

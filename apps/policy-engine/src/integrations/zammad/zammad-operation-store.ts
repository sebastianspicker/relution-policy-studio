/** Executes atomic claim and completion transactions for Zammad operations. */
import type { ZammadConnection, ZammadTicketResult } from "../../contracts/zammad.js";
import { ensureOperationCapacity, ensureOperationCompletionHeadroom } from "./zammad-operation-capacity.js";
import { readOperation, writeOperation } from "./zammad-operation-file.js";
import { hasErrorCode } from "../../platform/filesystem/error-code.js";
import { withOperationStoreLock } from "./zammad-operation-lock.js";
import { OPERATION_VERSION, type PersistedOperation } from "./zammad-operation-contract.js";
import { persistedResult, resultFromRecord } from "./zammad-operation-identities.js";
import { mergePersistedTicketResults } from "./zammad-operation-identity-merge.js";

export function claimOperation(workspace: string, operationId: string): { operation: PersistedOperation; created: boolean } {
  const existing = readOperation(workspace, operationId);
  if (existing !== undefined) return { operation: existing, created: false };
  return withOperationStoreLock(workspace, () => {
    const raced = readOperation(workspace, operationId);
    if (raced !== undefined) return { operation: raced, created: false };
    ensureOperationCapacity(workspace);
    const started: PersistedOperation = { version: OPERATION_VERSION, id: operationId, state: "started", updatedAt: new Date().toISOString() };
    try {
      writeOperation(workspace, started, false);
      return { operation: started, created: true };
    } catch (error) {
      if (!hasErrorCode(error, "EEXIST")) throw error;
      const concurrent = readOperation(workspace, operationId);
      if (concurrent === undefined) throw new Error("Zammad operation claim disappeared; refusing ticket creation", { cause: error });
      return { operation: concurrent, created: false };
    }
  });
}

/** Persists and returns the canonical merged completion while holding the store lock. */
export function persistCompleted(
  workspace: string,
  operationId: string,
  result: ZammadTicketResult,
  connection: ZammadConnection,
): ZammadTicketResult {
  return withOperationStoreLock(workspace, () => {
    const existing = readOperation(workspace, operationId);
    if (existing === undefined) throw new Error(`Zammad operation claim disappeared: ${operationId}`);
    const incoming = persistedResult(result);
    const canonical = existing.state === "completed" ? mergePersistedTicketResults(existing.result, incoming) : incoming;
    if (existing.state === "started" || !sameResult(existing.result, canonical)) {
      ensureOperationCompletionHeadroom(workspace, operationId);
      writeOperation(workspace, { version: OPERATION_VERSION, id: operationId, state: "completed", updatedAt: new Date().toISOString(), result: canonical }, true);
    }
    const completed = resultFromRecord(canonical, connection);
    return result.title === undefined ? completed : { ...completed, title: result.title };
  });
}

function sameResult(left: { id?: number; number?: string }, right: { id?: number; number?: string }): boolean {
  return left.id === right.id && left.number === right.number;
}

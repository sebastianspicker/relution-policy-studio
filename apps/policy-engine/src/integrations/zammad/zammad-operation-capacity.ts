/** Keeps operation-store admission and replacement writes within durable capacity. */
import { unlinkSync } from "node:fs";
import { ATOMIC_WRITE_DIRECTORY_ENTRY_HEADROOM, MAX_OPERATION_DIRECTORY_ENTRIES, MAX_OPERATION_FILES, type CompletedOperation } from "./zammad-operation-contract.js";
import { listOperations } from "./zammad-operation-directory.js";
import { hasErrorCode } from "../../platform/filesystem/error-code.js";
import { operationPath } from "./zammad-operation-paths.js";
import { zammadOperationStoreCapacityError } from "./zammad-operation-error.js";

export function ensureOperationCapacity(workspace: string): void {
  const snapshot = listOperations(workspace);
  const completed = snapshot.operations.filter((operation): operation is CompletedOperation => operation.state === "completed").sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  let retained = snapshot.operations.length;
  let retainedEntries = snapshot.directoryEntryCount;
  for (const operation of completed) {
    if (retained < MAX_OPERATION_FILES && retainedEntries <= MAX_OPERATION_DIRECTORY_ENTRIES - ATOMIC_WRITE_DIRECTORY_ENTRY_HEADROOM) break;
    removeOperation(workspace, operation.id);
    retained -= 1;
    retainedEntries -= 1;
  }
  if (retained >= MAX_OPERATION_FILES) throw zammadOperationStoreCapacityError("Zammad operation store has too many uncertain operations; retry after resolving an existing operation");
  if (retainedEntries > MAX_OPERATION_DIRECTORY_ENTRIES - ATOMIC_WRITE_DIRECTORY_ENTRY_HEADROOM) throw zammadOperationStoreCapacityError("Zammad operation store lacks safe atomic-write headroom; remove stale temporary files only after stopping all editors");
}

export function ensureOperationCompletionHeadroom(workspace: string, completingOperationId: string): void {
  const snapshot = listOperations(workspace);
  let retainedEntries = snapshot.directoryEntryCount;
  const removable = snapshot.operations.filter((operation): operation is CompletedOperation => operation.state === "completed" && operation.id !== completingOperationId).sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  for (const operation of removable) {
    if (retainedEntries <= MAX_OPERATION_DIRECTORY_ENTRIES - 1) break;
    removeOperation(workspace, operation.id);
    retainedEntries -= 1;
  }
  if (retainedEntries > MAX_OPERATION_DIRECTORY_ENTRIES - 1) throw zammadOperationStoreCapacityError("Zammad operation store lacks safe completion-write headroom; remove stale temporary files only after stopping all editors");
}

function removeOperation(workspace: string, operationId: string): void {
  try { unlinkSync(operationPath(workspace, operationId)); } catch (error) { if (!hasErrorCode(error, "ENOENT")) throw error; }
}

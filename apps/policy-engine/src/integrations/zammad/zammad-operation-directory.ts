/** Enumerates the bounded Zammad operation store and enforces write headroom. */
import { opendirSync } from "node:fs";
import { MAX_OPERATION_DIRECTORY_ENTRIES, type PersistedOperation } from "./zammad-operation-contract.js";
import { readOperation } from "./zammad-operation-file.js";
import { hasErrorCode } from "../../platform/filesystem/error-code.js";
import { OPERATION_STORE_LOCK, operationsPath } from "./zammad-operation-paths.js";
import { zammadOperationStoreCapacityError } from "./zammad-operation-error.js";

interface OperationStoreSnapshot { operations: PersistedOperation[]; directoryEntryCount: number; }

export function assertOperationLockHeadroom(directoryPath: string): void {
  const directory = openDirectory(directoryPath);
  if (directory === undefined) return;
  let count = 0;
  try {
    for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
      count += 1;
      if (count >= MAX_OPERATION_DIRECTORY_ENTRIES) throw zammadOperationStoreCapacityError(`Zammad operation store has no lock headroom within its ${String(MAX_OPERATION_DIRECTORY_ENTRIES)} entry limit`);
    }
  } finally { directory.closeSync(); }
}

export function listOperations(workspace: string): OperationStoreSnapshot {
  const directory = openDirectory(operationsPath(workspace));
  if (directory === undefined) return { operations: [], directoryEntryCount: 0 };
  const operations: PersistedOperation[] = [];
  let directoryEntryCount = 0;
  try {
    for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
      directoryEntryCount += 1;
      if (directoryEntryCount > MAX_OPERATION_DIRECTORY_ENTRIES) throw new Error(`Zammad operation store exceeds its ${String(MAX_OPERATION_DIRECTORY_ENTRIES)} entry limit`);
      const match = /^(relution-op-[a-f0-9]{64})\.json$/u.exec(entry.name);
      if (match?.[1] !== undefined) {
        const operation = readOperation(workspace, match[1]);
        if (operation === undefined) throw new Error("Zammad operation record disappeared while scanning");
        operations.push(operation);
      } else if (entry.name === OPERATION_STORE_LOCK && entry.isDirectory()) {
        // The caller owns this exclusive lock while it scans and claims.
      } else if (!(entry.isFile() && /^\.relution-op-[a-f0-9]{64}\.json\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/u.test(entry.name))) {
        throw new Error(`Unexpected file in Zammad operation store: ${entry.name}`);
      }
    }
  } finally { directory.closeSync(); }
  return { operations, directoryEntryCount };
}

function openDirectory(path: string): ReturnType<typeof opendirSync> | undefined {
  try { return opendirSync(path); } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return undefined;
    throw new Error("Zammad operation store is unavailable; refusing ticket creation", { cause: error });
  }
}

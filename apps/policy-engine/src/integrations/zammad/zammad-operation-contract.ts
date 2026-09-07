/** Defines the persisted Zammad operation record shape and store limits. */

export const OPERATION_VERSION = 1;
export const MAX_OPERATION_BYTES = 4 * 1024;
export const MAX_OPERATION_FILES = 256;
export const MAX_OPERATION_DIRECTORY_ENTRIES = MAX_OPERATION_FILES + 32;
export const ATOMIC_WRITE_DIRECTORY_ENTRY_HEADROOM = 2;

export interface PersistedTicketResult {
  id?: number;
  number?: string;
}

interface StartedOperation {
  version: 1;
  id: string;
  state: "started";
  updatedAt: string;
}

export interface CompletedOperation {
  version: 1;
  id: string;
  state: "completed";
  updatedAt: string;
  result: PersistedTicketResult;
}

export type PersistedOperation = StartedOperation | CompletedOperation;

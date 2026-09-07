/** Defines transport-neutral failures for durable Zammad ticket operations. */
import type { ZammadOperationErrorContext } from "../../contracts/zammad.js";

export class ZammadOperationError extends Error {
  readonly context: ZammadOperationErrorContext;

  constructor(context: ZammadOperationErrorContext, message: string) {
    super(message);
    this.name = "ZammadOperationError";
    this.context = context;
  }
}

export function isZammadOperationError(error: unknown): error is ZammadOperationError {
  return error instanceof ZammadOperationError;
}

export function uncertainZammadOperationOutcome(operationId: string): ZammadOperationError {
  return new ZammadOperationError(
    { kind: "uncertain-outcome", operationId },
    `Zammad ticket outcome is uncertain for operation ${operationId}; search Zammad for this operation ID before retrying.`,
  );
}

export function zammadOperationStoreCapacityError(message: string): ZammadOperationError {
  return new ZammadOperationError({ kind: "store-capacity" }, message);
}

export function zammadOperationStoreBusyError(): ZammadOperationError {
  return new ZammadOperationError(
    { kind: "store-busy" },
    "Zammad operation store is busy; retry after the other editor finishes. If no editor is running, remove the stale .capacity.lock directory only after confirming ticket creation has stopped.",
  );
}

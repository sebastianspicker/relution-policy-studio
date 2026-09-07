/** Defines queue admission errors and pending-operation state. */
export class OperationQueueFullError extends Error {
  constructor(maxPending: number) {
    super(`Operation queue is full (${String(maxPending)} pending requests)`);
    this.name = "OperationQueueFullError";
  }
}

export class OperationQueueAbortedError extends Error {
  constructor(message = "Queued operation was cancelled before it started") {
    super(message);
    this.name = "OperationQueueAbortedError";
  }
}

export class OperationQueueClosedError extends Error {
  constructor() {
    super("Operation queue is closed");
    this.name = "OperationQueueClosedError";
  }
}

export interface PendingOperation {
  readonly operation: () => Promise<unknown> | unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly signal?: AbortSignal;
  abortListener?: () => void;
  started: boolean;
  settled: boolean;
}

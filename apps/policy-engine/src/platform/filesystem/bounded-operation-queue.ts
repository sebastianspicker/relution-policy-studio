/** Runs asynchronous work with bounded concurrency and admission control. */
import {
  OperationQueueAbortedError,
  OperationQueueClosedError,
  OperationQueueFullError,
  type PendingOperation,
} from "./bounded-operation-queue-contract.js";

export {
  OperationQueueAbortedError,
  OperationQueueClosedError,
  OperationQueueFullError,
} from "./bounded-operation-queue-contract.js";

export class BoundedOperationQueue {
  readonly #maxPending: number;
  readonly #maxConcurrent: number;
  #pending = 0;
  #running = 0;
  #closed = false;
  readonly #waiting: PendingOperation[] = [];
  readonly #idleWaiters = new Set<() => void>();

  constructor(maxPending: number, maxConcurrent = 1) {
    if (!Number.isSafeInteger(maxPending) || maxPending < 1) {
      throw new Error("Operation queue limit must be a positive safe integer");
    }
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > maxPending) {
      throw new Error("Operation queue concurrency must be a positive safe integer within its pending limit");
    }
    this.#maxPending = maxPending;
    this.#maxConcurrent = maxConcurrent;
  }

  get pendingCount(): number {
    return this.#pending;
  }

  get waitingCount(): number {
    return this.#waiting.length;
  }

  run<T>(operation: () => Promise<T> | T, options: { readonly signal?: AbortSignal } = {}): Promise<T> {
    const { signal } = options;
    if (this.#closed) {
      return Promise.reject(new OperationQueueClosedError());
    }
    if (signal?.aborted === true) {
      return Promise.reject(abortReason(signal));
    }
    if (this.#pending >= this.#maxPending) {
      return Promise.reject(new OperationQueueFullError(this.#maxPending));
    }
    return new Promise<T>((resolve, reject) => {
      const entry: PendingOperation = {
        operation,
        resolve: (value) => resolve(value as T),
        reject,
        ...(signal === undefined ? {} : { signal }),
        started: false,
        settled: false,
      };
      if (signal !== undefined) {
        entry.abortListener = () => {
          this.#cancelWaiting(entry, abortReason(signal));
        };
        signal.addEventListener("abort", entry.abortListener, { once: true });
      }
      this.#pending += 1;
      this.#waiting.push(entry);
      this.#startAvailable();
    });
  }

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      while (this.#waiting.length > 0) {
        const entry = this.#waiting.shift();
        if (entry === undefined) break;
        this.#cancelWaiting(entry, new OperationQueueClosedError(), false);
      }
      this.#notifyIdle();
    }
    await this.onIdle();
  }

  async onIdle(): Promise<void> {
    if (this.#pending === 0) return;
    await new Promise<void>((resolve) => {
      this.#idleWaiters.add(resolve);
    });
  }

  #startAvailable(): void {
    while (this.#running < this.#maxConcurrent && this.#waiting.length > 0) {
      const entry = this.#waiting.shift();
      if (entry === undefined || entry.settled) continue;
      if (this.#closed) {
        this.#cancelWaiting(entry, new OperationQueueClosedError(), false);
        continue;
      }
      if (entry.signal?.aborted === true) {
        this.#cancelWaiting(entry, abortReason(entry.signal), false);
        continue;
      }
      entry.started = true;
      this.#running += 1;
      this.#removeAbortListener(entry);
      let result: Promise<unknown> | unknown;
      try {
        // Once selected to start, marking and invocation stay synchronous.
        // Detach abort handling before non-idempotent work can begin.
        result = entry.operation();
      } catch (error) {
        this.#settleRunning(entry, () => entry.reject(error));
        continue;
      }
      void Promise.resolve(result).then(
        (value) => this.#settleRunning(entry, () => entry.resolve(value)),
        (error: unknown) => this.#settleRunning(entry, () => entry.reject(error)),
      );
    }
    this.#notifyIdle();
  }

  #cancelWaiting(entry: PendingOperation, reason: Error, drain = true): void {
    if (entry.started || entry.settled) return;
    entry.settled = true;
    this.#pending -= 1;
    this.#removeAbortListener(entry);
    const waitingIndex = this.#waiting.indexOf(entry);
    if (waitingIndex >= 0) this.#waiting.splice(waitingIndex, 1);
    entry.reject(reason);
    this.#notifyIdle();
    if (drain) this.#startAvailable();
  }

  #settleRunning(entry: PendingOperation, settle: () => void): void {
    if (entry.settled) return;
    entry.settled = true;
    this.#pending -= 1;
    this.#running -= 1;
    settle();
    this.#notifyIdle();
    this.#startAvailable();
  }

  #removeAbortListener(entry: PendingOperation): void {
    if (entry.signal !== undefined && entry.abortListener !== undefined) {
      entry.signal.removeEventListener("abort", entry.abortListener);
      delete entry.abortListener;
    }
  }

  #notifyIdle(): void {
    if (this.#pending !== 0) return;
    for (const resolve of this.#idleWaiters) resolve();
    this.#idleWaiters.clear();
  }
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new OperationQueueAbortedError();
}

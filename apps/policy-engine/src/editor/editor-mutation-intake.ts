/** Bounds mutation admission, concurrent body reads, and serial state effects per domain. */
import type { IncomingMessage } from "node:http";
import {
  BoundedOperationQueue,
  OperationQueueAbortedError,
  OperationQueueClosedError,
  OperationQueueFullError,
} from "../platform/filesystem/bounded-operation-queue.js";
import { readJsonBodyOutcome, withParsedJsonBody } from "./editor-json-body.js";

export const MAX_EDITOR_MUTATIONS_PER_DOMAIN = 32;
export const MAX_EDITOR_RESERVED_BODY_BYTES_PER_DOMAIN = 65 * 1024 * 1024;
const MAX_EDITOR_BODY_READERS_PER_DOMAIN = 2;

export class EditorMutationBodyCapacityError extends Error {
  constructor(maxReservedBytes: number) {
    super(`Editor mutation body reservations exceed ${String(maxReservedBytes)} bytes`);
    this.name = "EditorMutationBodyCapacityError";
  }
}

export class EditorMutationIntake {
  readonly #maxAdmitted: number;
  readonly #maxReservedBytes: number;
  readonly #bodyReaders: BoundedOperationQueue;
  readonly #effects: BoundedOperationQueue;
  readonly #activeReaders = new Set<IncomingMessage>();
  readonly #idleWaiters = new Set<() => void>();
  #admitted = 0;
  #reservedBytes = 0;
  #closed = false;

  constructor(
    maxAdmitted = MAX_EDITOR_MUTATIONS_PER_DOMAIN,
    maxReservedBytes = MAX_EDITOR_RESERVED_BODY_BYTES_PER_DOMAIN,
    maxBodyReaders = Math.min(MAX_EDITOR_BODY_READERS_PER_DOMAIN, maxAdmitted),
  ) {
    if (!Number.isSafeInteger(maxAdmitted) || maxAdmitted < 1) throw new Error("Editor mutation admission limit must be a positive safe integer");
    if (!Number.isSafeInteger(maxReservedBytes) || maxReservedBytes < 1) throw new Error("Editor mutation body reservation limit must be a positive safe integer");
    this.#maxAdmitted = maxAdmitted;
    this.#maxReservedBytes = maxReservedBytes;
    this.#bodyReaders = new BoundedOperationQueue(maxAdmitted, maxBodyReaders);
    this.#effects = new BoundedOperationQueue(maxAdmitted);
  }

  get pendingCount(): number {
    return this.#admitted;
  }

  get reservedBodyBytes(): number {
    return this.#reservedBytes;
  }

  /** Programmatic diagnostics for bounded-concurrency tests; never exposed over HTTP. */
  get activeBodyReaderCount(): number {
    return this.#activeReaders.size;
  }

  async run<T>(
    request: IncomingMessage,
    bodyLimitBytes: number,
    readsBody: boolean,
    operation: () => Promise<T> | T,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<T> {
    this.#reserve(bodyLimitBytes);
    try {
      if (!readsBody) return await this.#effects.run(operation, options);
      const body = await this.#bodyReaders.run(async () => await this.#readBody(request, bodyLimitBytes, options.signal), options);
      return await this.#effects.run(
        async () => await withParsedJsonBody(request, body, operation),
        options,
      );
    } finally {
      this.#admitted -= 1;
      this.#reservedBytes -= bodyLimitBytes;
      this.#notifyIdle();
    }
  }

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      for (const request of this.#activeReaders) {
        request.destroy(new OperationQueueClosedError());
      }
    }
    await Promise.all([this.#bodyReaders.close(), this.#effects.close()]);
    await this.#onIdle();
  }

  #reserve(bodyLimitBytes: number): void {
    if (!Number.isSafeInteger(bodyLimitBytes) || bodyLimitBytes < 0) throw new Error("Editor request body limit must be a non-negative safe integer");
    if (this.#closed) throw new OperationQueueClosedError();
    if (this.#admitted >= this.#maxAdmitted) throw new OperationQueueFullError(this.#maxAdmitted);
    if (this.#reservedBytes + bodyLimitBytes > this.#maxReservedBytes) {
      throw new EditorMutationBodyCapacityError(this.#maxReservedBytes);
    }
    this.#admitted += 1;
    this.#reservedBytes += bodyLimitBytes;
  }

  async #readBody(request: IncomingMessage, bodyLimitBytes: number, signal: AbortSignal | undefined) {
    const abort = (): void => { request.destroy(abortReason(signal)); };
    this.#activeReaders.add(request);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (signal?.aborted === true) abort();
      return await readJsonBodyOutcome(request, bodyLimitBytes);
    } finally {
      signal?.removeEventListener("abort", abort);
      this.#activeReaders.delete(request);
    }
  }

  async #onIdle(): Promise<void> {
    if (this.#admitted === 0) return;
    await new Promise<void>((resolve) => this.#idleWaiters.add(resolve));
  }

  #notifyIdle(): void {
    if (this.#admitted !== 0) return;
    for (const resolve of this.#idleWaiters) resolve();
    this.#idleWaiters.clear();
  }
}

function abortReason(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error ? signal.reason : new OperationQueueAbortedError();
}

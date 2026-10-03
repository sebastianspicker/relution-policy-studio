/** Routes authenticated editor mutations to their owning feature handlers. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError } from "./editor-http-error.js";
import {
  OperationQueueAbortedError,
  OperationQueueClosedError,
  OperationQueueFullError,
} from "../platform/filesystem/bounded-operation-queue.js";
import {
  EditorMutationBodyCapacityError,
  EditorMutationIntake,
  MAX_EDITOR_MUTATIONS_PER_DOMAIN,
} from "./editor-mutation-intake.js";
import type { EditorMutationDomain } from "./editor-request-dispatcher.js";

export interface EditorMutationQueues {
  readonly workspace: EditorMutationIntake;
  readonly relution: EditorMutationIntake;
  readonly zammad: EditorMutationIntake;
  readonly campusweave: EditorMutationIntake;
}

export function createEditorMutationQueues(maxPending = MAX_EDITOR_MUTATIONS_PER_DOMAIN): EditorMutationQueues {
  return {
    workspace: new EditorMutationIntake(maxPending),
    relution: new EditorMutationIntake(maxPending),
    zammad: new EditorMutationIntake(maxPending),
    campusweave: new EditorMutationIntake(maxPending),
  };
}

export function editorMutationQueueForDomain(domain: EditorMutationDomain, queues: EditorMutationQueues): EditorMutationIntake {
  return queues[domain];
}

export async function runEditorMutation<T>(
  queue: EditorMutationIntake,
  request: IncomingMessage,
  bodyLimitBytes: number,
  readsBody: boolean,
  operation: () => Promise<T>,
  options: { readonly signal?: AbortSignal } = {},
): Promise<T> {
  try {
    return await queue.run(request, bodyLimitBytes, readsBody, operation, options);
  } catch (error) {
    if (error instanceof OperationQueueFullError || error instanceof EditorMutationBodyCapacityError) {
      throw new HttpError(503, error.message, true);
    }
    if (error instanceof OperationQueueClosedError) {
      throw new HttpError(503, "Editor server is shutting down", true);
    }
    throw error;
  }
}

export async function closeEditorMutationQueues(queues: EditorMutationQueues): Promise<void> {
  await Promise.all(Object.values(queues).map(async (queue) => await queue.close()));
}

export function editorMutationRequestCancellation(
  request: IncomingMessage,
  response: ServerResponse,
): { readonly signal: AbortSignal; readonly dispose: () => void } {
  const controller = new AbortController();
  const abort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(new OperationQueueAbortedError("Editor request disconnected before its mutation started"));
    }
  };
  const onRequestClose = (): void => {
    if (!request.complete) abort();
  };
  const onResponseClose = (): void => {
    if (!response.writableFinished) abort();
  };
  request.once("close", onRequestClose);
  response.once("close", onResponseClose);
  if ((request.destroyed && !request.complete) || (response.destroyed && !response.writableFinished)) abort();
  return {
    signal: controller.signal,
    dispose: () => {
      request.off("close", onRequestClose);
      response.off("close", onResponseClose);
    },
  };
}

export function isEditorMutationCancellation(error: unknown): boolean {
  return error instanceof OperationQueueAbortedError;
}

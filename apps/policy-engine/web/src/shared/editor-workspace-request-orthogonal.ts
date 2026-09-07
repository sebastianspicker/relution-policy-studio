/** Tracks non-workspace request epochs associated with one workspace guard. */
import { WorkspaceRequestGuard } from "./editor-workspace-request-guard.js";

export type OrthogonalStateRequest = { readonly intent: number };

type OrthogonalRequestState = {
  readonly keyIntent: number;
  readonly sidecarIntent: number;
  readonly activeSidecarMutationIntent: number | undefined;
};

const requestStates = new WeakMap<WorkspaceRequestGuard, OrthogonalRequestState>();
const workspaceRequestGuards = new WeakMap<object, WorkspaceRequestGuard>();

export function workspaceRequestGuardFor(key: object): WorkspaceRequestGuard {
  const guard = workspaceRequestGuards.get(key) ?? new WorkspaceRequestGuard();
  workspaceRequestGuards.set(key, guard);
  return guard;
}

function requestStateFor(guard: WorkspaceRequestGuard): OrthogonalRequestState {
  return requestStates.get(guard) ?? { keyIntent: 0, sidecarIntent: 0, activeSidecarMutationIntent: undefined };
}

function updateRequestState(guard: WorkspaceRequestGuard, state: OrthogonalRequestState): void {
  requestStates.set(guard, state);
}

export function beginKeyMutation(guard: WorkspaceRequestGuard): OrthogonalStateRequest {
  const state = requestStateFor(guard);
  const request = { intent: state.keyIntent + 1 };
  updateRequestState(guard, { ...state, keyIntent: request.intent });
  return request;
}

export function isCurrentKeyMutation(guard: WorkspaceRequestGuard, request: OrthogonalStateRequest): boolean {
  return requestStateFor(guard).keyIntent === request.intent;
}

export function beginSidecarMutation(guard: WorkspaceRequestGuard): OrthogonalStateRequest | undefined {
  const state = requestStateFor(guard);
  if (state.activeSidecarMutationIntent !== undefined) return undefined;
  const request = { intent: state.sidecarIntent + 1 };
  updateRequestState(guard, { ...state, sidecarIntent: request.intent, activeSidecarMutationIntent: request.intent });
  return request;
}

export function isCurrentSidecarMutation(guard: WorkspaceRequestGuard, request: OrthogonalStateRequest): boolean {
  return requestStateFor(guard).activeSidecarMutationIntent === request.intent;
}

export function finishSidecarMutation(guard: WorkspaceRequestGuard, request: OrthogonalStateRequest): void {
  const state = requestStateFor(guard);
  if (state.activeSidecarMutationIntent === request.intent) updateRequestState(guard, { ...state, activeSidecarMutationIntent: undefined });
}

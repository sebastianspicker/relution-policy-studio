import type { AppState, JsonRecord, WorkspaceResponse } from "./types.js";

export type KeyUpdateResponse = JsonRecord & {
  readonly keySet?: boolean;
  readonly validated?: boolean;
  readonly reason?: string;
};

type KeyState = Pick<AppState, "keySet" | "keyValidated"> & Pick<Partial<AppState>, "keyValidationReason">;

export function keyResponseState(response: KeyUpdateResponse): KeyState {
  const keyValidated = response.validated === true;
  const reason = typeof response.reason === "string" && response.reason.length > 0 ? response.reason : undefined;
  const base = { keySet: response.keySet === true, keyValidated };
  return keyValidated || reason === undefined ? base : { ...base, keyValidationReason: reason };
}

export function importedKeyState(response: Pick<WorkspaceResponse, "keySet">, current: KeyState): KeyState {
  if (response.keySet === true) {
    return { keySet: true, keyValidated: true };
  }
  const base = { keySet: current.keySet, keyValidated: current.keyValidated };
  return current.keyValidationReason === undefined ? base : { ...base, keyValidationReason: current.keyValidationReason };
}

export function keyStatusMessage(state: KeyState): string {
  if (!state.keySet) {
    return "No key set";
  }
  if (state.keyValidated === true) {
    return "Key validated";
  }
  return state.keyValidationReason === undefined ? "Key set, not validated" : `Key set, not validated: ${state.keyValidationReason}`;
}

export function keyBadgeState(state: Pick<AppState, "keySet" | "keyValidated">): { readonly label: string; readonly warn: boolean } {
  if (!state.keySet) {
    return { label: "No key", warn: true };
  }
  if (state.keyValidated === true) {
    return { label: "Key validated", warn: false };
  }
  return { label: "Key set, not validated", warn: true };
}

/** Debounces validation of dirty editor workspaces. */
import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { WorkspaceValidationResult } from "../../../../src/browser/workspace.js";
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import type { AppState } from "../../shared/editor-contracts.js";

const LIVE_VALIDATION_DELAY_MS = 250;

/** Revalidates a dirty workspace after the existing debounce interval. */
export function useEditorWorkspaceLiveValidation(
  isDirty: boolean,
  state: AppState | undefined,
  setState: Dispatch<SetStateAction<AppState | undefined>>,
  setStatus: Dispatch<SetStateAction<string>>,
): void {
  useEffect(() => {
    if (!isDirty || state === undefined) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void postJson("/api/workspace/validate", { workspace: state.workspace }).then(async (response) => {
        const result = await readJsonResponse<{ validation: WorkspaceValidationResult }>(response);
        if (!cancelled && response.ok) {
          setState((current) => current === undefined ? current : { ...current, validation: result.validation });
        }
      }).catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setState((current) => current === undefined ? current : { ...current, validation: { ok: false, errors: [{ path: "workspace", message }] } });
          setStatus(`Live validation failed: ${message}`);
        }
      });
    }, LIVE_VALIDATION_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isDirty, setState, setStatus, state?.workspace]);
}

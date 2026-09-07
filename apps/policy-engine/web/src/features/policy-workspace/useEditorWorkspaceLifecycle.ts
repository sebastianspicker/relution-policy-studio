/** Synchronizes workspace loading, live validation, and unload protection. */
import { useEffect, type Dispatch, type SetStateAction } from "react";
import { loadState } from "../../shared/editor-api-client.js";
import type { EditorControllerWorkspaceSetters } from "../../shared/editor-controller-action-contracts.js";

/** Loads the initial editor state once, ignoring results after unmount. */
export function useInitialEditorWorkspaceState(props: Pick<
  EditorControllerWorkspaceSetters,
  "setState" | "setSelection" | "setRawJsonState" | "setRawJsonDirty" | "setHasFreshBuild"
> & {
  readonly setLoadError: Dispatch<SetStateAction<string | undefined>>;
}): void {
  useEffect(() => {
    let cancelled = false;
    void loadState().then((loaded) => {
      if (cancelled) {
        return;
      }
      props.setLoadError(undefined);
      props.setState(loaded);
      props.setSelection(undefined);
      props.setRawJsonState("");
      props.setRawJsonDirty(false);
      props.setHasFreshBuild(false);
    }).catch((error: unknown) => {
      if (!cancelled) {
        props.setLoadError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

/** Warns before an unload that would discard local workspace changes. */
export function useDirtyBeforeUnloadWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);
}

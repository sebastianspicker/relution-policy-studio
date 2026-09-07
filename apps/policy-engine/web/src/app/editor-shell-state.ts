/** Persists the inspector toggle independently from route and editor-controller state. */
import { useEffect } from "react";

const INSPECTOR_PINNED_STORAGE_NAME = "rexp-studio:inspector-pinned";

export function usePersistedInspectorPinned(inspectorPinned: boolean): void {
  useEffect(() => {
    try {
      window.localStorage.setItem(INSPECTOR_PINNED_STORAGE_NAME, String(inspectorPinned));
    } catch {
      // Browsers that reject local storage still render the inspector normally.
    }
  }, [inspectorPinned]);
}

export function readInspectorPinned(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(INSPECTOR_PINNED_STORAGE_NAME);
    return stored !== "false";
  } catch {
    return true;
  }
}

import type { JSX } from "react";
import type { EditorController } from "./types.js";

export function StatusBar({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  return (
    <footer className="status-bar">
      {c.status.length > 0 ? (
        <span
          className={`status-bar-message${statusIsError(c.status) ? " status-bar-message--error" : ""}`}
          role={statusIsError(c.status) ? "alert" : "status"}
          aria-live={statusIsError(c.status) ? "assertive" : "polite"}
        >
          {c.status}
        </span>
      ) : (
        <span className="status-bar-message status-bar-message--idle" aria-hidden="true" />
      )}
      <span className={c.isDirty ? "dirty-badge" : "saved-badge"}>
        {c.isDirty ? "Unsaved" : "Saved"}
      </span>
    </footer>
  );
}

function statusIsError(status: string): boolean {
  const lower = status.toLowerCase();
  return lower.startsWith("error") || lower.startsWith("build blocked") || lower.startsWith("build failed") || lower.startsWith("key update blocked") || status.startsWith("✕");
}

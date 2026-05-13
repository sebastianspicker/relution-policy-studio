import type { JSX } from "react";
import type { EditorController } from "./types.js";

export function StatusBar({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  const statusKind = classifyStatus(c.status);
  return (
    <footer className="status-bar">
      {c.status.length > 0 ? (
        <span
          className={`status-bar-message${statusKind === "error" ? " status-bar-message--error" : ""}`}
          role={statusKind === "error" ? "alert" : "status"}
          aria-live={statusKind === "error" ? "assertive" : "polite"}
        >
          {c.status}
        </span>
      ) : (
        <span className="status-bar-message" aria-hidden="true" />
      )}
      <span className={c.isDirty ? "dirty-badge" : "saved-badge"}>
        {c.isDirty ? "Unsaved" : "Saved"}
      </span>
    </footer>
  );
}

type StatusKind = "error" | "info";

function classifyStatus(status: string): StatusKind {
  const lower = status.toLowerCase();
  if (lower.startsWith("error") || lower.startsWith("build blocked") || lower.startsWith("build failed") || lower.startsWith("key update blocked") || status.startsWith("✕")) {
    return "error";
  }
  return "info";
}

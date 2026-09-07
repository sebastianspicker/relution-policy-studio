/** Summarizes current workspace status and action feedback in a persistent editor footer. */
import type { JSX } from "react";
import type { EditorController } from "../shared/editor-contracts.js";

const isHostedDemo = import.meta.env.MODE === "demo";

export function StatusBar({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  const statusKind = c.lastActionResult?.ok === false ? "error" : classifyStatus(c.status);
  const syncBadge = syncBadgeFor(c.isDirty, c.lastActionResult, isHostedDemo);
  const outputFile = c.state.outputFile;
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
      <span className="status-bar-context">
        {isHostedDemo ? (
          <>Hosted demo <span aria-hidden="true">·</span> in-memory only</>
        ) : (
          <>Local workspace <span aria-hidden="true">·</span> autosave off <span aria-hidden="true">·</span> <span className="status-bar-loopback">127.0.0.1</span></>
        )}
      </span>
      {!isHostedDemo && outputFile.length > 0 ? (
        <span className="status-bar-path" title={outputFile}>{outputFile}</span>
      ) : null}
      <span className={syncBadge.className}>
        {syncBadge.label}
      </span>
    </footer>
  );
}

type StatusKind = "error" | "info";

function classifyStatus(status: string): StatusKind {
  const lower = status.toLowerCase();
  if (lower.startsWith("error") || lower.startsWith("build blocked") || lower.startsWith("build failed") || lower.startsWith("download failed") || lower.startsWith("passphrase update blocked") || status.startsWith("✕")) {
    return "error";
  }
  return "info";
}

function syncBadgeFor(
  isDirty: boolean,
  lastActionResult: EditorController["lastActionResult"],
  isDemo: boolean,
): { readonly className: string; readonly label: string } {
  if (isDirty) {
    return { className: "dirty-badge", label: "Unsaved" };
  }
  if (lastActionResult?.ok === false) {
    return { className: "dirty-badge", label: "Sync unknown" };
  }
  if (isDemo) {
    return { className: "saved-badge", label: "In memory" };
  }
  return { className: "saved-badge", label: "Saved locally" };
}

import type { JSX } from "react";
import { IconInspector, IconRedo, IconUndo } from "./icons.js";
import type { EditorController } from "./types.js";

export function WorkspaceToolbar(props: {
  readonly controller: EditorController;
  readonly inspectorPinned: boolean;
  readonly onToggleInspector: () => void;
}): JSX.Element {
  const c = props.controller;

  return (
    <header className="toolbar">
      <div className="toolbar-main">
        <div className="toolbar-brand">
          <strong>Relution Policy Workbench</strong>
          {c.isDirty ? <span className="dirty-dot" aria-label="Unsaved changes" role="status" /> : null}
        </div>
        <div className="toolbar-primary">
          <button
            type="button"
            className="toolbar-icon-btn"
            disabled={!c.canUndo}
            onClick={c.undoWorkspace}
            title="Undo (⌘Z)"
            aria-label="Undo"
          >
            <IconUndo />
          </button>
          <button
            type="button"
            className="toolbar-icon-btn"
            disabled={!c.canRedo}
            onClick={c.redoWorkspace}
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
          >
            <IconRedo />
          </button>
          <div className="toolbar-separator" aria-hidden="true" />
          <button
            type="button"
            disabled={!c.isDirty}
            className="btn-primary"
            onClick={() => void c.saveWorkspace()}
            title="Save (⌘S)"
          >
            Save
          </button>
          <div className="toolbar-separator" aria-hidden="true" />
          <button
            type="button"
            className="btn-primary btn-build"
            onClick={() => void c.buildArchive()}
            disabled={c.isBuildLoading}
            title="Build .rexp (⌘B)"
          >
            {c.isBuildLoading ? <span className="loading-spinner" aria-hidden="true" /> : null}
            Build .rexp
          </button>
          {c.hasFreshBuild ? (
            <a className="button-link" href="/api/output">
              Download
            </a>
          ) : (
            <button type="button" disabled>
              Download
            </button>
          )}
          <div className="toolbar-separator" aria-hidden="true" />
          <button
            type="button"
            className="toolbar-icon-btn"
            onClick={props.onToggleInspector}
            aria-pressed={props.inspectorPinned}
            title={props.inspectorPinned ? "Hide inspector (⌘I)" : "Show inspector (⌘I)"}
            aria-label="Toggle inspector panel"
          >
            <IconInspector />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Renders workspace history, persistence, build, download, and inspector actions. */
import type { JSX } from "react";
import { IconInspector, IconRedo, IconUndo } from "../ui/icons.js";
import { Button } from "../ui/Button.js";
import type { EditorController } from "../shared/editor-contracts.js";
import { downloadOutputArchive, reportDownloadError } from "../features/policy-workspace/workspace-toolbar-actions.js";

export function WorkspaceToolbarPrimaryActions(props: {
  readonly controller: EditorController;
  readonly inspectorAvailable?: boolean | undefined;
  readonly inspectorPinned: boolean;
  readonly onToggleInspector: () => void;
}): JSX.Element {
  const c = props.controller;

  return (
    <div className="toolbar-primary">
      <Button
        type="button"
        className="toolbar-icon-btn"
        size="icon"
        variant="quiet"
        disabled={!c.canUndo}
        onClick={c.undoWorkspace}
        title="Undo (⌘Z)"
        aria-label="Undo"
      >
        <IconUndo />
      </Button>
      <Button
        type="button"
        className="toolbar-icon-btn"
        size="icon"
        variant="quiet"
        disabled={!c.canRedo}
        onClick={c.redoWorkspace}
        title="Redo (⇧⌘Z)"
        aria-label="Redo"
      >
        <IconRedo />
      </Button>
      <div className="toolbar-separator" aria-hidden="true" />
      {c.isDirty ? (
        <span className="toolbar-status" aria-label="Unsaved changes" role="status">
          <span className="dirty-dot" aria-hidden="true" />
          Unsaved changes
        </span>
      ) : null}
      <Button
        type="button"
        disabled={!c.isDirty}
        className="btn-save"
        size="compact"
        variant="quiet"
        onClick={() => void c.saveWorkspace()}
        title="Save changes"
      >
        Save
      </Button>
      <div className="toolbar-separator" aria-hidden="true" />
      <Button
        type="button"
        className="btn-build"
        size="compact"
        variant="primary"
        onClick={() => void c.buildArchive()}
        disabled={c.isBuildLoading}
        title="Build .rexp (⌘B)"
      >
        {c.isBuildLoading ? <span className="loading-spinner" aria-hidden="true" /> : null}
        Build archive
      </Button>
      {c.hasFreshBuild ? (
        <Button type="button" className="button-link" size="compact" variant="quiet" onClick={() => void downloadOutputArchive().catch((error) => reportDownloadError(error, c.setStatus))}>
          Download
        </Button>
      ) : (
        <>
          <Button type="button" disabled size="compact" variant="quiet" aria-describedby="download-disabled-reason">
            Download
          </Button>
          <span id="download-disabled-reason" className="visually-hidden">
            Create a fresh .rexp archive before downloading.
          </span>
        </>
      )}
      {props.inspectorAvailable !== false ? (
        <>
          <div className="toolbar-separator" aria-hidden="true" />
          <Button
            type="button"
            className="toolbar-icon-btn"
            size="icon"
            variant="quiet"
            onClick={props.onToggleInspector}
            aria-pressed={props.inspectorPinned}
            title={props.inspectorPinned ? "Hide inspector (⌘I)" : "Show inspector (⌘I)"}
            aria-label="Toggle inspector panel"
          >
            <IconInspector />
          </Button>
        </>
      ) : null}
    </div>
  );
}

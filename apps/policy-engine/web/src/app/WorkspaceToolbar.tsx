/** Provides workspace-level save, history, import, and build actions with guarded availability. */
import type { JSX } from "react";
import type { AppSection } from "../shared/application-sections.js";
import type { EditorController } from "../shared/editor-contracts.js";
import { WorkspaceToolbarPrimaryActions } from "./WorkspaceToolbarPrimaryActions.js";
import { workspaceContext } from "../features/policy-workspace/workspace-toolbar-actions.js";

export function WorkspaceToolbar(props: {
  readonly appSection?: AppSection;
  readonly controller: EditorController;
  readonly inspectorAvailable?: boolean;
  readonly inspectorPinned: boolean;
  readonly onToggleInspector: () => void;
}): JSX.Element {
  const c = props.controller;
  const context = workspaceContext(props.appSection ?? "policies", c);

  return (
    <header className="toolbar">
      <div className="toolbar-main">
        <div className="toolbar-product">
          <span className="toolbar-product-name">REXP Studio</span>
          <span className="toolbar-product-version">v0.1.0</span>
        </div>
        <nav className="toolbar-context" aria-label="Workspace context">
          {context.map((segment, index) => (
            <span className={index === context.length - 1 ? "toolbar-context-segment toolbar-context-segment--current" : "toolbar-context-segment"} key={`${segment}-${index}`}>
              {index > 0 ? <span className="toolbar-context-separator" aria-hidden="true">/</span> : null}
              {segment}
            </span>
          ))}
        </nav>
        <WorkspaceToolbarPrimaryActions
          controller={c}
          inspectorAvailable={props.inspectorAvailable}
          inspectorPinned={props.inspectorPinned}
          onToggleInspector={props.onToggleInspector}
        />
      </div>
    </header>
  );
}

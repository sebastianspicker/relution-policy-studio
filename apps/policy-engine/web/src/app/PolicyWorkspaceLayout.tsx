/** Keeps responsive workspace-pane selection and inspector visibility in one layout boundary. */
import type { JSX, ReactNode } from "react";
import { ConfigurationInspector } from "../features/policy-workspace/ConfigurationInspector.js";
import { PolicyNavigator } from "../features/policy-workspace/PolicyNavigator.js";
import type { EditorController } from "../shared/editor-contracts.js";

export type CompactPane = "editor" | "navigation" | "inspector";

export function PolicyWorkspaceLayout(props: {
  readonly compactPane: CompactPane;
  readonly controller: EditorController;
  readonly inspectorPinned: boolean;
  readonly onCompactPaneChange: (pane: CompactPane) => void;
  readonly children: ReactNode;
}): JSX.Element {
  const workspaceClassName = `policy-workspace-grid compact-pane-${props.compactPane}${props.inspectorPinned ? " inspector-pinned" : ""}`;
  const c = props.controller;

  return (
    <>
      <nav className="mobile-pane-controls" aria-label="Policy workspace panes">
        <button type="button" aria-pressed={props.compactPane === "editor"} onClick={() => props.onCompactPaneChange("editor")}>
          Editor
        </button>
        <button type="button" aria-controls="editor-navigation-pane" aria-pressed={props.compactPane === "navigation"} onClick={() => props.onCompactPaneChange("navigation")}>
          Navigation
        </button>
        <button type="button" aria-controls="editor-inspector-pane" aria-pressed={props.compactPane === "inspector"} onClick={() => props.onCompactPaneChange("inspector")}>
          Inspector
        </button>
      </nav>
      <section className={workspaceClassName} aria-label="Policy workspace">
        <aside id="editor-navigation-pane" className="sidebar">
          <PolicyNavigator
            policies={c.state.workspace.policies}
            selection={c.selection}
            templatesByType={c.templatesByType}
            newPolicyName={c.newPolicyName}
            newPolicyPlatform={c.newPolicyPlatform}
            creatablePlatforms={c.creatablePlatforms}
            isDirty={c.isDirty}
            onSelect={c.setSelection}
            onMoveConfiguration={(selection, direction) => void c.moveConfiguration(selection, direction)}
            onRemoveConfiguration={(selection) => void c.removeConfiguration(selection)}
            onNewPolicyNameChange={c.setNewPolicyName}
            onNewPolicyPlatformChange={c.setNewPolicyPlatform}
            onCreatePolicy={() => void c.addPolicy()}
          />
        </aside>
        <section className="editor-panel">{props.children}</section>
        <ConfigurationInspector controller={c} id="editor-inspector-pane" />
      </section>
    </>
  );
}

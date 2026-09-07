/** Renders shortcut help, destructive reset confirmation, and workspace facts. */
import { useState, type JSX } from "react";
import type { EditorController } from "../../shared/editor-contracts.js";

export function ShortcutSettings(): JSX.Element {
  const shortcuts = shortcutLabels();
  return (
    <section className="settings-section" id="settings-shortcuts">
      <h2>Keyboard shortcuts</h2>
      <dl className="settings-shortcuts">
        <div><dt><kbd>{shortcuts.save}</kbd></dt><dd>Save workspace</dd></div>
        <div><dt><kbd>{shortcuts.build}</kbd></dt><dd>Build .rexp archive</dd></div>
        <div><dt><kbd>{shortcuts.inspector}</kbd></dt><dd>Toggle inspector panel</dd></div>
        <div><dt><kbd>{shortcuts.undo}</kbd></dt><dd>Undo last change</dd></div>
        <div><dt><kbd>{shortcuts.redo}</kbd></dt><dd>Redo</dd></div>
      </dl>
    </section>
  );
}

export function DangerSettings({ controller }: { readonly controller: EditorController }): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  function clearWorkspace(): void {
    controller.clearWorkspace();
    setConfirming(false);
  }
  return (
    <section className="settings-section settings-danger" id="settings-danger">
      <h2>Danger zone</h2>
      <p className="settings-hint">Permanently removes all local policy data. This cannot be undone.</p>
      {confirming ? (
        <div className="settings-field-row">
          <button type="button" className="btn-danger" onClick={clearWorkspace}>Yes, clear workspace</button>
          <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-danger"
          disabled={controller.state.workspace.policies.length === 0 && !controller.isDirty}
          onClick={() => setConfirming(true)}
        >
          Clear workspace
        </button>
      )}
    </section>
  );
}

export function AboutSettings({ controller }: { readonly controller: EditorController }): JSX.Element {
  return (
    <section className="settings-section" id="settings-about">
      <h2>About</h2>
      <dl className="settings-about">
        <div><dt>Server version</dt><dd><code>{controller.state.bundle.serverVersion}</code></dd></div>
        <div><dt>Workspace policies</dt><dd>{controller.state.workspace.policies.length}</dd></div>
        <div><dt>Local changes</dt><dd>{controller.isDirty ? "Unsaved" : "Saved"}</dd></div>
      </dl>
    </section>
  );
}

function shortcutLabels(): { readonly save: string; readonly build: string; readonly inspector: string; readonly undo: string; readonly redo: string } {
  const applePlatform = /Mac|iPhone|iPad|iPod/u.test(globalThis.navigator?.platform ?? "");
  const command = applePlatform ? "⌘" : "Ctrl+";
  const shift = applePlatform ? "⇧" : "Shift+";
  return { save: `${command}S`, build: `${command}B`, inspector: `${command}I`, undo: `${command}Z`, redo: `${shift}${command}Z` };
}

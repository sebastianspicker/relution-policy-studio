import { useState, type JSX } from "react";
import { JsonTemplateImportControl } from "./JsonTemplateImportControl.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";
import type { CorporateTheme } from "./theme.js";
import type { EditorController } from "./types.js";

export function SettingsPanel(props: {
  readonly controller: EditorController;
  readonly theme: CorporateTheme;
  readonly onThemeChange: (theme: CorporateTheme) => void;
}): JSX.Element {
  const c = props.controller;
  const [rexpFileName, setRexpFileName] = useState<string>();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-panel-body">
        <section className="settings-section">
          <h3>Appearance</h3>
          <ThemeSwitcher theme={props.theme} onThemeChange={props.onThemeChange} />
        </section>

        <section className="settings-section">
          <h3>Encryption</h3>
          <p className="settings-hint">Required to build or import encrypted archives.</p>
          <div className="settings-field-row">
            <input
              className="key-input"
              type="password"
              aria-label="Encryption key"
              value={c.keyValue}
              onChange={(event) => c.setKeyValue(event.target.value)}
              placeholder={c.state.keySet ? "Key set ●●●" : "Enter encryption key…"}
            />
            <button type="button" onClick={() => void c.setActiveKey()}>
              Set key
            </button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Import</h3>
          <div className="settings-import-group">
            <p className="settings-hint">Import a .rexp policy archive.</p>
            <div className="settings-field-row">
              <label className="btn file-input-label" title={rexpFileName ?? "Select .rexp file"}>
                {rexpFileName ?? "Choose .rexp…"}
                <input
                  type="file"
                  accept=".rexp"
                  aria-label="Relution .rexp file"
                  className="visually-hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    c.setImportFile(file);
                    setRexpFileName(file?.name);
                  }}
                />
              </label>
              <button type="button" onClick={() => void c.importArchive()}>
                Import
              </button>
            </div>
          </div>
          <div className="settings-import-group">
            <p className="settings-hint">Import a BSI-style ruleset JSON.</p>
            <JsonTemplateImportControl
              label="Import ruleset"
              ariaLabel="Ruleset JSON file"
              disabled={false}
              onFileChange={c.setRulesetFile}
              onImport={() => void c.importRuleset()}
            />
          </div>
        </section>

        <section className="settings-section">
          <h3>Keyboard shortcuts</h3>
          <dl className="settings-shortcuts">
            <div>
              <dt><kbd>⌘S</kbd></dt>
              <dd>Save workspace</dd>
            </div>
            <div>
              <dt><kbd>⌘B</kbd></dt>
              <dd>Build .rexp archive</dd>
            </div>
            <div>
              <dt><kbd>⌘I</kbd></dt>
              <dd>Toggle inspector panel</dd>
            </div>
            <div>
              <dt><kbd>⌘Z</kbd></dt>
              <dd>Undo last change</dd>
            </div>
            <div>
              <dt><kbd>⇧⌘Z</kbd></dt>
              <dd>Redo</dd>
            </div>
          </dl>
        </section>

        <section className="settings-section">
          <h3>Danger zone</h3>
          <p className="settings-hint">Permanently removes all local policy data. This cannot be undone.</p>
          {showClearConfirm ? (
            <div className="settings-field-row">
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  c.clearWorkspace();
                  setShowClearConfirm(false);
                }}
              >
                Yes, clear workspace
              </button>
              <button type="button" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-danger"
              disabled={c.state.workspace.policies.length === 0 && !c.isDirty}
              onClick={() => setShowClearConfirm(true)}
            >
              Clear workspace
            </button>
          )}
        </section>

        <section className="settings-section">
          <h3>About</h3>
          <p className="settings-hint">
            Server version: <code>{c.state.bundle.serverVersion}</code>
          </p>
        </section>
      </div>
    </div>
  );
}

/** Renders archive-passphrase and local archive/ruleset import controls. */
import { useState, type JSX } from "react";
import { FieldFrame } from "../../ui/FieldFrame.js";
import { JsonTemplateImportControl } from "../../ui/JsonTemplateImportControl.js";
import { StatusChip } from "../../ui/StatusChip.js";
import { keyBadgeState } from "../../shared/key-validation.js";
import type { EditorController } from "../../shared/editor-contracts.js";

export function EncryptionSettings({ controller }: { readonly controller: EditorController }): JSX.Element {
  const keyBadge = keyBadgeState(controller.state);
  return (
    <section className="settings-section" id="settings-encryption">
      <h2>Encryption</h2>
      <p className="settings-hint">An archive passphrase is required to build or import encrypted archives.</p>
      <div className="settings-field-row">
        <StatusChip kind={keyBadge.warn ? "warning" : "success"}>{keyBadge.label}</StatusChip>
        <FieldFrame className="settings-key-field" label="Archive passphrase" description="Masked in the browser and sent only to the local editor process." required>
          <input
            className="key-input"
            name="archive-passphrase"
            type="password"
            autoComplete="new-password"
            value={controller.keyValue}
            onChange={(event) => controller.setKeyValue(event.target.value)}
            placeholder="Enter archive passphrase…"
          />
        </FieldFrame>
        <button type="button" onClick={() => void controller.setActiveKey()}>Set passphrase</button>
      </div>
    </section>
  );
}

export function ImportSettings({ controller }: { readonly controller: EditorController }): JSX.Element {
  const [rexpFileName, setRexpFileName] = useState<string>();
  return (
    <section className="settings-section" id="settings-import">
      <h2>Import</h2>
      <div className="settings-import-row">
        <div><h3>.rexp archive</h3><p className="settings-hint">Import a Relution policy archive into the current workspace.</p></div>
        <div className="settings-field-row">
          <label className="btn file-input-label" title={rexpFileName ?? "Select .rexp file"}>
            {rexpFileName ?? "Choose .rexp…"}
            <input
              type="file"
              accept=".rexp"
              aria-label="Relution .rexp file"
              className="visually-hidden"
              onChange={(event) => selectRexpFile(event.target.files?.[0], controller, setRexpFileName)}
            />
          </label>
          <button type="button" onClick={() => void controller.importArchive()}>Import archive</button>
        </div>
      </div>
      <div className="settings-import-row">
        <div><h3>Ruleset JSON</h3><p className="settings-hint">Import a BSI-style ruleset JSON file.</p></div>
        <JsonTemplateImportControl
          label="Import ruleset"
          ariaLabel="Ruleset JSON file"
          disabled={false}
          onFileChange={controller.setRulesetFile}
          onImport={() => void controller.importRuleset()}
        />
      </div>
    </section>
  );
}

function selectRexpFile(file: File | undefined, controller: EditorController, setFileName: (name: string | undefined) => void): void {
  controller.setImportFile(file);
  setFileName(file?.name);
}

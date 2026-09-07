/** Renders editable raw JSON state for the selected configuration. */
import type { JSX } from "react";
import type { EditorController } from "../../shared/editor-contracts.js";

export function ConfigurationInspectorRawJson({ controller }: { readonly controller: EditorController }): JSX.Element {
  return (
    <div className="inspector-content">
      <h2>Configuration JSON</h2>
      {controller.rawJsonDirty ? <p className="warning">Raw JSON draft differs from the live configuration. Reset JSON to discard the draft.</p> : null}
      <textarea aria-label="Configuration raw JSON" value={controller.rawJson} onChange={(event) => controller.setRawJson(event.target.value)} />
      <div className="json-actions">
        <button type="button" disabled={!controller.rawJsonDirty || controller.configuration === undefined} onClick={controller.resetRawJson}>Reset JSON</button>
        <button type="button" disabled={controller.configuration === undefined} onClick={controller.applyRawJson}>Apply JSON</button>
      </div>
    </div>
  );
}

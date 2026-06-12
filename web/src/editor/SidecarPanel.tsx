import { useEffect, useState, type JSX } from "react";
import type { DdmArtifact, MdmCommandArtifact } from "../../../src/apple-schema.js";
import type { MobileConfigRestoreEntry } from "../../../src/sidecar.js";
import type { EditorController, JsonRecord } from "./types.js";

export function SidecarPanel({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  return (
    <div className="inspector-content">
      <div className="sidecar-header">
        <p className="sidecar-summary">
          Apple schema {c.state.appleSchema.source.revision}: {c.state.appleSchema.entries.length} entries. Restore snapshots:{" "}
          {c.state.sidecar.mobileConfigRestore.length}. DDM artifacts: {c.state.sidecar.ddmArtifacts.length}. MDM command drafts:{" "}
          {c.state.sidecar.mdmCommandArtifacts.length}.
        </p>
        <button type="button" onClick={() => void c.reconcileSidecar()}>
          Reconcile
        </button>
      </div>
      <ArtifactCreator
        title="DDM artifact"
        value={c.ddmSchemaId}
        entries={c.availableDdmEntries.map((entry) => ({ id: entry.id, label: `${entry.title} (${entry.kind})` }))}
        onChange={c.setDdmSchemaId}
        onAdd={c.addDdmArtifact}
      />
      <ArtifactCreator
        title="MDM command draft"
        value={c.mdmCommandSchemaId}
        entries={c.availableMdmCommands.map((entry) => ({ id: entry.id, label: entry.title }))}
        onChange={c.setMdmCommandSchemaId}
        onAdd={c.addMdmCommandArtifact}
      />
      <RestoreSnapshots entries={c.state.sidecar.mobileConfigRestore} />
      <h3>DDM artifacts</h3>
      {c.state.sidecar.ddmArtifacts.map((artifact) => (
        <ArtifactEditor
          key={artifact.uuid}
          artifactId={artifact.uuid}
          title={artifact.title}
          subtitle={artifact.identifier}
          values={artifact.values}
          payload={artifact.payload}
          onApply={(valuesJson) => void c.updateDdmArtifact(artifact.uuid, valuesJson)}
          onRemove={() => void c.removeDdmArtifact(artifact.uuid)}
        />
      ))}
      <h3>MDM command drafts</h3>
      {c.state.sidecar.mdmCommandArtifacts.map((artifact) => (
        <ArtifactEditor
          key={artifact.uuid}
          artifactId={artifact.uuid}
          title={artifact.title}
          subtitle={artifact.requestType}
          values={artifact.values}
          payload={artifact.payload}
          onApply={(valuesJson) => void c.updateMdmCommandArtifact(artifact.uuid, valuesJson)}
          onRemove={() => void c.removeMdmCommandArtifact(artifact.uuid)}
        />
      ))}
    </div>
  );
}

function ArtifactCreator(props: {
  readonly title: string;
  readonly value: string;
  readonly entries: readonly { readonly id: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
  readonly onAdd: () => Promise<void>;
}): JSX.Element {
  return (
    <div className="artifact-creator">
      <label>
        <span className="field-label">{props.title}</span>
        <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          <option value="" disabled>
            Select {props.title}...
          </option>
          {props.entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => void props.onAdd()}>
        Add
      </button>
    </div>
  );
}

function RestoreSnapshots(props: { readonly entries: readonly MobileConfigRestoreEntry[] }): JSX.Element {
  if (props.entries.length === 0) {
    return <p className="sidecar-summary">No mobileconfig restore snapshots recorded yet.</p>;
  }
  return (
    <details className="restore-snapshots">
      <summary>Restore snapshots</summary>
      {props.entries.map((entry) => (
        <p key={`${entry.policyPath}-${entry.configurationUuid}`}>
          <strong>{entry.displayName}</strong>
          <span>{entry.policyName}</span>
          <code>{entry.payloadType}</code>
        </p>
      ))}
    </details>
  );
}

function ArtifactEditor(props: {
  readonly artifactId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly values: JsonRecord;
  readonly payload: JsonRecord;
  readonly onApply: (valuesJson: string) => void;
  readonly onRemove: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState(() => JSON.stringify(props.values, null, 2));
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    setDraft(JSON.stringify(props.values, null, 2));
    setConfirming(false);
  }, [props.artifactId]);
  return (
    <details className="artifact-card">
      <summary>
        <span>{props.title}</span>
        <code>{props.subtitle}</code>
      </summary>
      <label>
        <span className="field-label">Values JSON</span>
        <textarea className="compact-code-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <details>
        <summary>Payload preview</summary>
        <pre>{JSON.stringify(props.payload, null, 2)}</pre>
      </details>
      {confirming ? (
        <div className="inline-actions confirm-remove" role="alert">
          <span className="confirm-remove-label">Remove? Cannot be undone by workspace undo.</span>
          <button type="button" className="btn-danger" onClick={() => { setConfirming(false); props.onRemove(); }}>
            Confirm remove
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="inline-actions">
          <button type="button" onClick={() => props.onApply(draft)}>
            Apply
          </button>
          <button type="button" onClick={() => setDraft(JSON.stringify(props.values, null, 2))}>
            Reset
          </button>
          <button type="button" className="btn-danger" onClick={() => setConfirming(true)}>
            Remove
          </button>
        </div>
      )}
    </details>
  );
}

import {useState} from 'react';
import type {EditorController} from './types';
import {Alert, Field, JsonEditor, JsonView} from './ui';
import {download, downloadArchive} from './api';
export function Archives({c}: {c: EditorController}) {
  const [error, setError] = useState('');
  return (
    <div className="page-body">
      <div className="two-columns">
        <section>
          <h3>Import archive</h3>
          <Field label="Archive file">
            <input type="file" accept=".rexp" onChange={e => c.setImportFile(e.target.files?.[0])} />
          </Field>
          <p>Set the archive passphrase in Settings first.</p>
          <button disabled={c.isDirty || !c.state.keySet} onClick={() => void c.importArchive()}>
            Inspect and import archive
          </button>
          <h3>Local archive output</h3>
          <button disabled={!c.hasFreshBuild} onClick={() => void downloadArchive().catch(e => setError(String(e)))}>
            Download archive
          </button>
          <p className="muted">
            Build from Policies after saving and validating. Archive output contains policies; assignment is a separate
            review.
          </p>
          <details>
            <summary>Archive and workspace inspection</summary>
            <JsonView
              value={{
                metadata: c.state.workspace.metadata,
                report: c.state.workspace.report,
                validation: c.state.validation,
                output: c.state.outputFile,
              }}
            />
          </details>
        </section>
        <section>
          <h3>Import policy data</h3>
          <Field label="JSON templates">
            <input type="file" accept=".json" onChange={e => c.setJsonTemplateFile(e.target.files?.[0])} />
          </Field>
          <button disabled={c.isDirty} onClick={() => void c.importJsonTemplates()}>
            Import templates
          </button>
          <Field label="Ruleset file">
            <input type="file" accept=".json" onChange={e => c.setRulesetFile(e.target.files?.[0])} />
          </Field>
          <button disabled={c.isDirty} onClick={() => void c.importRuleset()}>
            Import ruleset
          </button>
          {c.rulesetReport && <JsonView value={c.rulesetReport} />}
          <button onClick={() => download(c.state.workspace, 'workspace.json')}>Export workspace JSON</button>
        </section>
      </div>
      {error && <Alert>{error}</Alert>}
      <Sidecars c={c} />
    </div>
  );
}
function Sidecars({c}: {c: EditorController}) {
  return (
    <section className="sidecars">
      <h2>Apple profiles and sidecar artifacts</h2>
      <p>Catalog: {c.state.appleSchema.source.revision}. MDM output retains its LAB boundary.</p>
      <button disabled={c.isDirty} onClick={() => void c.reconcileSidecar()}>
        Reconcile sidecar
      </button>
      <button onClick={() => download(c.state.sidecar, 'editor-sidecar.json')}>Download sidecar</button>
      <div className="two-columns">
        <div>
          <Field label="DDM artifact">
            <select value={c.ddmSchemaId} onChange={e => c.setDdmSchemaId(e.target.value)}>
              <option value="">Select DDM schema</option>
              {c.availableDdmEntries.map(e => (
                <option value={e.id} key={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Field>
          <button disabled={!c.ddmSchemaId || c.isDirty} onClick={() => void c.addDdmArtifact()}>
            Add DDM artifact
          </button>
        </div>
        <div>
          <Field label="MDM command draft · LAB">
            <select value={c.mdmCommandSchemaId} onChange={e => c.setMdmCommandSchemaId(e.target.value)}>
              <option value="">Select command schema</option>
              {c.availableMdmCommands.map(e => (
                <option value={e.id} key={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </Field>
          <button disabled={!c.mdmCommandSchemaId || c.isDirty} onClick={() => void c.addMdmCommandArtifact()}>
            Add command draft
          </button>
        </div>
      </div>
      {c.state.sidecar.ddmArtifacts.map(a => (
        <details key={a.uuid}>
          <summary>{a.title}</summary>
          <JsonEditor
            label="Artifact values"
            value={a.values}
            onApply={v => void c.updateDdmArtifact(a.uuid, JSON.stringify(v))}
          />
          <button onClick={() => download(a.payload, a.identifier + '.json')}>Download payload</button>
          <button onClick={() => void c.removeDdmArtifact(a.uuid)}>Remove artifact</button>
        </details>
      ))}
      {c.state.sidecar.mdmCommandArtifacts.map(a => (
        <details key={a.uuid}>
          <summary>{a.title} · LAB</summary>
          <JsonEditor
            label="Command values"
            value={a.values}
            onApply={v => void c.updateMdmCommandArtifact(a.uuid, JSON.stringify(v))}
          />
          <button onClick={() => download(a.payload, a.requestType + '.json')}>Download command</button>
          <button onClick={() => void c.removeMdmCommandArtifact(a.uuid)}>Remove command</button>
        </details>
      ))}
      <details>
        <summary>Mobileconfig recovery snapshots</summary>
        <JsonView value={c.state.sidecar.mobileConfigRestore} />
      </details>
    </section>
  );
}

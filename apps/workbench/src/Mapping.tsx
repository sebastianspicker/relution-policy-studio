import {useState} from 'react';
import type {CampusWeaveMapping} from 'rexp-studio/browser';
import type {EditorController, Project} from './types';
import {digest, request, planner} from './api';
import {Field, Alert, JsonView} from './ui';
export function Mapping({
  project,
  update,
  c,
}: {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  c: EditorController;
}) {
  const [intent, setIntent] = useState('');
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const [applicability, setApplicability] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    try {
      if (!reviewed || !c.policy || !c.configuration || !c.details || c.isDirty)
        throw new Error('Review the saved policy, platform, field value and applicability first.');
      const mapping: CampusWeaveMapping = {
        id: crypto.randomUUID(),
        intent_id: intent,
        workspace_id: String(c.state.active_workspace_id ?? ''),
        policy_id: c.policy.path,
        configuration_id: String(c.configuration.uuid ?? c.details.uuid ?? ''),
        field,
        value: JSON.parse(value),
        platform: String(c.policy.document.platform ?? ''),
        configuration_type: String(c.details.type ?? ''),
        applicability,
        reviewed: true,
        profile_digest: await digest(project.profile),
        policy_revision: c.state.revision,
      };
      if (!mapping.workspace_id) throw new Error('Create or link this policy workspace in Workspaces first.');
      const compiled = await planner<Record<string, unknown>>('compile', {profile: project.profile});
      update(p => ({...p, compiled_plan: compiled, mappings: [...p.mappings, mapping]}));
      setError(
        compiled.valid === false ? 'Mapping saved for review. Resolve planning diagnostics before projection.' : '',
      );
      setReviewed(false);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <Field label="Policy intent">
        <select
          value={intent}
          onChange={e => {
            setIntent(e.target.value);
            setReviewed(false);
          }}
        >
          <option value="">Select intent</option>
          {project.profile.intents.map(i => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
      <details open={!!intent}>
        <summary>Review policy mapping</summary>
        <Field label="Concrete configuration field">
          <input
            value={field}
            onChange={e => {
              setField(e.target.value);
              setReviewed(false);
            }}
            list="configuration-fields"
          />
          <datalist id="configuration-fields">
            {c.template?.fields.map(f => (
              <option key={f.path}>{f.path}</option>
            ))}
          </datalist>
        </Field>
        <Field label="Reviewed value (JSON)">
          <textarea
            value={value}
            onChange={e => {
              setValue(e.target.value);
              setReviewed(false);
            }}
            placeholder="Enter the intended value"
          />
        </Field>
        <Field label="Applicability">
          <textarea
            value={applicability}
            onChange={e => {
              setApplicability(e.target.value);
              setReviewed(false);
            }}
          />
        </Field>
        <p>
          Platform: {String(c.policy?.document.platform ?? 'Unresolved')}
          <br />
          Configuration: {String(c.details?.type ?? 'Unresolved')}
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed platform,
          configuration type, value and applicability.
        </label>
        <button disabled={!intent || !field || !applicability || !reviewed || c.isDirty} onClick={() => void save()}>
          Save reviewed mapping
        </button>
      </details>
      {error && <Alert>{error}</Alert>}
      {project.mappings
        .filter(m => m.intent_id === intent)
        .map(m => (
          <details key={m.id}>
            <summary>{String(m.field)} · reviewed mapping</summary>
            <JsonView value={m} />
            <button
              onClick={() =>
                void request('/api/campusweave/projection', {
                  projectId: project.id,
                  expectedRevision: project.revision,
                  mappingId: m.id,
                  expectedWorkspaceRevision: c.state.revision,
                })
                  .then(() => window.location.reload())
                  .catch(e => setError(String(e)))
              }
            >
              Project reviewed value
            </button>
            <button
              className="danger"
              onClick={() => update(p => ({...p, mappings: p.mappings.filter(x => x.id !== m.id)}))}
            >
              Remove mapping
            </button>
          </details>
        ))}
    </>
  );
}

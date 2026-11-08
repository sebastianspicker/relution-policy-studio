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
      if (!mapping.workspace_id)
        throw new Error('Create or link this policy workspace in the Workspaces tab under Policies first.');
      if (c.state.active_project_id !== project.id)
        throw new Error("The open policy workspace belongs to another project. Open one of this project's workspaces.");
      const profileKey = JSON.stringify(project.profile);
      const compiled = await planner<Record<string, unknown>>('compile', {profile: project.profile});
      if (compiled.valid !== true)
        throw new Error('Resolve the planning diagnostics before saving a mapping. Nothing was saved.');
      // One mapping per setting: a new review by the same intent replaces the earlier one; another intent's is a conflict (as in SaveMap).
      const sameSetting = (m: CampusWeaveMapping) =>
        m.workspace_id === mapping.workspace_id &&
        m.policy_id === mapping.policy_id &&
        m.configuration_id === mapping.configuration_id &&
        m.field === mapping.field;
      let refused = '';
      // update() runs the change synchronously on the live project, so `refused` is set before it is read.
      update(p => {
        if (JSON.stringify(p.profile) !== profileKey)
          refused = 'The profile changed during compilation. Nothing was saved; save the mapping again.';
        else if (p.mappings.some(m => sameSetting(m) && m.intent_id !== mapping.intent_id))
          refused = `${field} is already owned by another intent. Remove or resolve that mapping before saving.`;
        if (refused) return p;
        return {...p, compiled_plan: compiled, mappings: [...p.mappings.filter(m => !sameSetting(m)), mapping]};
      });
      if (refused) throw new Error(refused);
      setError('');
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
                void request<{mapping_restamped?: boolean}>('/api/campusweave/projection', {
                  projectId: project.id,
                  expectedRevision: project.revision,
                  mappingId: m.id,
                  expectedWorkspaceRevision: c.state.revision,
                })
                  .then(result => {
                    if (result.mapping_restamped === false)
                      window.alert(
                        'The value was projected, but the project changed at the same time, so this mapping is marked stale. Review and save it again.',
                      );
                    window.location.reload();
                  })
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

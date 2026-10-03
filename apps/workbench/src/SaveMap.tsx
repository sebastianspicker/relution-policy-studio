import {useEffect, useMemo, useRef, useState} from 'react';
import type {CampusWeaveMapping} from 'rexp-studio/browser';
import type {EditorController, Project} from './types';
import {planner} from './api';
import {Stamp} from './ui';
import './save-artifacts.css';

interface SaveMapProps {
  c: EditorController;
  project: Project;
  update: (fn: (project: Project) => Project) => void;
  projectSaved: boolean;
  onContinue: () => void;
  onBack: () => void;
}

interface MappableField {
  path: string;
  label: string;
  value: unknown;
}

type CompiledPlan = Record<string, unknown> & {
  valid?: boolean;
  profile_digest?: string;
};

const mappingKey = (mapping: Record<string, unknown>) =>
  [mapping.workspace_id, mapping.policy_id, mapping.configuration_id, mapping.field].map(String).join('\u0000');

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const displayValue = (value: unknown): string => {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
};

function versionConfigurations(c: EditorController): Record<string, unknown>[] {
  const policyIndex = c.selection?.policyIndex;
  const versionIndex = c.selection?.versionIndex ?? 0;
  if (policyIndex === undefined) return [];
  const policy = c.state.workspace.policies[policyIndex];
  const versions = Array.isArray(policy?.document.versions) ? policy.document.versions : [];
  const version = asRecord(versions[versionIndex]);
  if (!Array.isArray(version?.configurations)) return [];
  return version.configurations.flatMap(value => {
    const record = asRecord(value);
    return record === undefined ? [] : [record];
  });
}

function configurationLabel(c: EditorController, configuration: Record<string, unknown>, index: number): string {
  const details = asRecord(configuration.details);
  const type = String(details?.type ?? '');
  return String(
    configuration.name ?? c.templatesByType.get(type)?.label ?? (type || `Configuration ${String(index + 1)}`),
  );
}

function Arrow({back = false}: {back?: boolean}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={back ? 'M19 12H5m6 6-6-6 6-6' : 'M5 12h14m-6-6 6 6-6 6'} />
    </svg>
  );
}

export function SaveMap({c, project, update, projectSaved, onContinue, onBack}: SaveMapProps) {
  const [setupOpen, setSetupOpen] = useState(true);
  const [intentId, setIntentId] = useState(() => {
    try {
      const stored = sessionStorage.getItem(`campusweave:intent:${project.id}`) ?? '';
      return project.profile.intents.some(candidate => candidate.id === stored) ? stored : '';
    } catch {
      return '';
    }
  });
  const [applicability, setApplicability] = useState('');
  const [reviewedFields, setReviewedFields] = useState<Set<string>>(() => new Set());
  const [savingMappings, setSavingMappings] = useState(false);
  const [savedMappings, setSavedMappings] = useState(false);
  const [sawProjectUnsaved, setSawProjectUnsaved] = useState(false);
  const [mappingsPersisted, setMappingsPersisted] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [error, setError] = useState('');

  const workspaceId = String(c.state.active_workspace_id ?? '');
  const configurationId = String(c.configuration?.uuid ?? c.details?.uuid ?? '');
  const configurationType = String(c.details?.type ?? '');
  const policyId = c.policy?.path ?? '';
  const versions = Array.isArray(c.policy?.document.versions) ? c.policy.document.versions : [];
  const configurations = versionConfigurations(c);
  const fields = useMemo<MappableField[]>(() => {
    const details = c.details;
    if (!c.template || !details) return [];
    const seen = new Set<string>();
    return c.template.fields.flatMap(field => {
      if (
        field.path === 'uuid' ||
        field.path === 'type' ||
        field.path.includes('.') ||
        seen.has(field.path) ||
        !Object.hasOwn(details, field.path)
      )
        return [];
      seen.add(field.path);
      return [{path: field.path, label: field.label || field.path, value: details[field.path]}];
    });
  }, [c.template, c.details]);
  const intent = project.profile.intents.find(candidate => candidate.id === intentId);
  const live = useRef({
    c,
    project,
    projectSaved,
    workspaceId,
    policyId,
    configurationId,
    configurationType,
    intentId,
    applicability,
  });
  live.current = {
    c,
    project,
    projectSaved,
    workspaceId,
    policyId,
    configurationId,
    configurationType,
    intentId,
    applicability,
  };

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`campusweave:intent:${project.id}`) ?? '';
      setIntentId(project.profile.intents.some(candidate => candidate.id === stored) ? stored : '');
    } catch {
      setIntentId('');
    }
  }, [project.id, project.profile.intents]);

  useEffect(() => {
    setReviewedFields(new Set());
    setSavedMappings(false);
    setSawProjectUnsaved(false);
    setMappingsPersisted(false);
    setError('');
  }, [c.state.revision, policyId, configurationId, intentId, applicability]);

  useEffect(() => {
    if (!savedMappings) return;
    if (!projectSaved) setSawProjectUnsaved(true);
    else if (sawProjectUnsaved) setMappingsPersisted(true);
  }, [projectSaved, savedMappings, sawProjectUnsaved]);

  function selectPolicy(value: string) {
    if (!value) return;
    c.setSelection({policyIndex: Number(value), versionIndex: 0});
  }

  function selectVersion(value: string) {
    if (c.selection === undefined) return;
    c.setSelection({policyIndex: c.selection.policyIndex, versionIndex: Number(value)});
  }

  function selectConfiguration(value: string) {
    if (c.selection === undefined || !value) return;
    c.setSelection({...c.selection, configurationIndex: Number(value)});
  }

  async function savePolicy() {
    setSavingPolicy(true);
    setError('');
    try {
      await c.saveWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingPolicy(false);
    }
  }

  async function saveReviewedMappings() {
    setError('');
    if (c.isDirty) return setError('Save the policy workspace before reviewing its mappings.');
    if (!projectSaved) return setError('Wait for the project save to complete before adding mappings.');
    if (!workspaceId || !project.workspace_refs.some(reference => reference.id === workspaceId))
      return setError('Open a policy workspace attached to this project before mapping fields.');
    if (!policyId || !configurationId || !configurationType || !c.policy || !c.details)
      return setError('Select a policy and native configuration before reviewing mappings.');
    if (!intentId) return setError('Select the intent that owns these settings.');
    if (!applicability.trim()) return setError('Describe where this mapping applies.');
    const selected = fields.filter(field => reviewedFields.has(field.path));
    if (selected.length === 0) return setError('Explicitly review at least one saved field value.');

    const selectedKeys = new Set(
      selected.map(field =>
        mappingKey({
          workspace_id: workspaceId,
          policy_id: policyId,
          configuration_id: configurationId,
          field: field.path,
        }),
      ),
    );
    for (const key of selectedKeys) {
      const owners = project.mappings.filter(mapping => mappingKey(mapping) === key);
      if (owners.some(mapping => mapping.intent_id !== intentId)) {
        const field = selected.find(candidate => key.endsWith(`\u0000${candidate.path}`))?.path ?? 'selected field';
        return setError(`${field} is already owned by another intent. Remove or resolve that mapping before saving.`);
      }
    }

    const stamp = {
      projectId: project.id,
      projectRevision: project.revision,
      profile: JSON.stringify(project.profile),
      workspaceId,
      workspaceRevision: c.state.revision,
      policyId,
      configurationId,
      configurationType,
      intentId,
      applicability: applicability.trim(),
      fields: JSON.stringify(selected.map(field => [field.path, field.value])),
    };
    setSavingMappings(true);
    try {
      const compiled = await planner<CompiledPlan>('compile', {profile: project.profile});
      if (compiled.valid !== true)
        throw new Error('The profile has unresolved compilation diagnostics. Resolve them before saving mappings.');
      if (typeof compiled.profile_digest !== 'string' || compiled.profile_digest.length === 0)
        throw new Error('The compiler did not return a profile digest.');
      const current = live.current;
      const currentFields =
        current.c.template && current.c.details
          ? current.c.template.fields.flatMap(field =>
              reviewedFields.has(field.path) && Object.hasOwn(current.c.details!, field.path)
                ? [[field.path, current.c.details![field.path]]]
                : [],
            )
          : [];
      if (
        current.project.id !== stamp.projectId ||
        current.project.revision !== stamp.projectRevision ||
        JSON.stringify(current.project.profile) !== stamp.profile ||
        current.workspaceId !== stamp.workspaceId ||
        current.c.state.revision !== stamp.workspaceRevision ||
        current.policyId !== stamp.policyId ||
        current.configurationId !== stamp.configurationId ||
        current.configurationType !== stamp.configurationType ||
        current.intentId !== stamp.intentId ||
        current.applicability.trim() !== stamp.applicability ||
        JSON.stringify(currentFields) !== stamp.fields ||
        !current.projectSaved
      ) {
        throw new Error(
          'The project, policy, or selected values changed while compiling. Review the current fields again.',
        );
      }
      const profileDigest = compiled.profile_digest;
      const nextMappings: CampusWeaveMapping[] = selected.map(field => {
        const key = mappingKey({
          workspace_id: workspaceId,
          policy_id: policyId,
          configuration_id: configurationId,
          field: field.path,
        });
        const existing = current.project.mappings.find(
          mapping => mappingKey(mapping) === key && mapping.intent_id === intentId,
        );
        return {
          ...existing,
          id: typeof existing?.id === 'string' ? existing.id : crypto.randomUUID(),
          intent_id: intentId,
          workspace_id: workspaceId,
          policy_id: policyId,
          configuration_id: configurationId,
          field: field.path,
          value: structuredClone(field.value),
          platform: String(c.policy!.document.platform ?? ''),
          configuration_type: configurationType,
          applicability: applicability.trim(),
          reviewed: true,
          profile_digest: profileDigest,
          policy_revision: c.state.revision,
        };
      });
      update(currentProject => {
        const retained = currentProject.mappings.filter(mapping => !selectedKeys.has(mappingKey(mapping)));
        return {...currentProject, compiled_plan: compiled, mappings: [...retained, ...nextMappings]};
      });
      setSavedMappings(true);
      setSawProjectUnsaved(false);
      setMappingsPersisted(false);
      setReviewedFields(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingMappings(false);
    }
  }

  const canReview =
    !c.isDirty && projectSaved && !!workspaceId && !!intentId && !!applicability.trim() && fields.length > 0;
  const currentMappingCount = project.mappings.filter(
    mapping =>
      mapping.workspace_id === workspaceId &&
      mapping.policy_id === policyId &&
      mapping.configuration_id === configurationId &&
      mapping.policy_revision === c.state.revision,
  ).length;

  return (
    <div className="save-artifacts-screen">
      <div className="worksheet-grid">
        <section className="save-artifacts-main" aria-labelledby="save-map-heading">
          <header className="worksheet-heading">
            <h1 id="save-map-heading">Save &amp; map</h1>
            <p>Link saved settings to their intended outcome.</p>
          </header>

          <section className={`policy-save-strip ${c.isDirty ? 'is-pending' : 'is-saved'}`} aria-live="polite">
            <span className="status-mark" aria-hidden="true">
              {c.isDirty ? <Stamp tone="caution">Unsaved</Stamp> : <Stamp tone="ok">Saved</Stamp>}
            </span>
            <span>
              <strong>{c.isDirty ? 'Policy changes need saving' : 'Policy saved locally'}</strong>
              <small>
                {c.policy
                  ? `${String(c.policy.document.name ?? c.policy.path)} / ${configurationType || 'Select configuration'}`
                  : 'Select a policy and configuration'}
              </small>
            </span>
            {(c.isDirty || savingPolicy) && (
              <button disabled={savingPolicy} onClick={() => void savePolicy()}>
                {savingPolicy ? 'Saving…' : 'Save policy'}
              </button>
            )}
          </section>

          <details className="mapping-policy-details" open={!c.configuration}>
            <summary>Policy selection</summary>
            <section className="mapping-selection" aria-labelledby="mapping-selection-heading">
              <div>
                <h2 id="mapping-selection-heading">Policy selection</h2>
                <p>Choose the concrete saved configuration whose values you will review.</p>
              </div>
              <div className="mapping-selectors">
                <label>
                  <span>Policy</span>
                  <select
                    disabled={savingMappings}
                    value={c.selection?.policyIndex ?? ''}
                    onChange={event => selectPolicy(event.target.value)}
                  >
                    <option value="">Select policy</option>
                    {c.state.workspace.policies.map((policy, index) => (
                      <option key={policy.path} value={index}>
                        {String(policy.document.name ?? policy.path)}
                      </option>
                    ))}
                  </select>
                </label>
                {versions.length > 1 && (
                  <label>
                    <span>Version</span>
                    <select
                      disabled={savingMappings}
                      value={c.selection?.versionIndex ?? 0}
                      onChange={event => selectVersion(event.target.value)}
                    >
                      {versions.map((_, index) => (
                        <option key={index} value={index}>
                          Version {String(index + 1)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span>Configuration</span>
                  <select
                    disabled={savingMappings || c.selection === undefined || configurations.length === 0}
                    value={c.selection?.configurationIndex ?? ''}
                    onChange={event => selectConfiguration(event.target.value)}
                  >
                    <option value="">Select configuration</option>
                    {configurations.map((configuration, index) => (
                      <option key={String(configuration.uuid ?? index)} value={index}>
                        {configurationLabel(c, configuration, index)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          </details>

          <section className="intent-mapping" aria-labelledby="intent-mapping-heading">
            <div className="mapping-heading-row">
              <div>
                <h2 id="intent-mapping-heading">Intent mappings</h2>
                <p>{intent?.outcome || 'Select the intended outcome for these settings.'}</p>
              </div>
              {currentMappingCount > 0 && <span className="badge">{currentMappingCount} current</span>}
            </div>
            <details
              className="mapping-setup"
              open={setupOpen}
              onToggle={event => setSetupOpen(event.currentTarget.open)}
            >
              <summary>Intent and applicability</summary>
              <div className="mapping-meta-fields">
                <label>
                  <span>Policy intent</span>
                  <select
                    disabled={savingMappings}
                    value={intentId}
                    onChange={event => {
                      setIntentId(event.target.value);
                      try {
                        sessionStorage.setItem(`campusweave:intent:${project.id}`, event.target.value);
                      } catch {
                        /* Session persistence is optional. */
                      }
                    }}
                  >
                    <option value="">Select intent</option>
                    {project.profile.intents.map(candidate => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Applicability</span>
                  <textarea
                    disabled={savingMappings}
                    value={applicability}
                    onChange={event => setApplicability(event.target.value)}
                    placeholder="Describe the platform, ownership, role or scope where these settings apply."
                  />
                </label>
              </div>
              <button
                disabled={!intentId || !applicability.trim()}
                onClick={() => {
                  setSetupOpen(false);
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLInputElement>('.mapping-review-check input')?.focus(),
                  );
                }}
              >
                Review saved fields
              </button>
            </details>
            <div className="mapping-table-wrap">
              <table className="mapping-table">
                <caption className="sr-only">
                  Saved configuration fields available for explicit intent mapping review
                </caption>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Saved value</th>
                    <th>Reviewed</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(field => {
                    const checked = reviewedFields.has(field.path);
                    const mapped = project.mappings.some(
                      mapping =>
                        mapping.workspace_id === workspaceId &&
                        mapping.policy_id === policyId &&
                        mapping.configuration_id === configurationId &&
                        mapping.field === field.path,
                    );
                    return (
                      <tr key={field.path}>
                        <td title={field.label}>
                          <code>{field.path}</code>
                        </td>
                        <td>
                          <code>{displayValue(field.value)}</code>
                        </td>
                        <td>
                          <label className="mapping-review-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={savingMappings || !canReview}
                              onChange={event =>
                                setReviewedFields(current => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(field.path);
                                  else next.delete(field.path);
                                  return next;
                                })
                              }
                            />
                            <span>Reviewed{mapped ? ' · mapped' : ''}</span>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!c.template && c.configuration && (
              <p className="inline-notice">
                This configuration type has no native Relution template schema available for safe field projection.
                Select a native configuration to create reviewed mappings.
              </p>
            )}
            {c.template && c.configuration && fields.length === 0 && (
              <p className="inline-notice">This configuration has no populated top-level schema fields to map.</p>
            )}
            {!c.configuration && (
              <p className="inline-notice">Select a configuration to review its actual saved values.</p>
            )}
            <p className="mapping-save-status" role="status">
              {savedMappings
                ? mappingsPersisted
                  ? 'Reviewed mappings saved locally.'
                  : 'Reviewed mappings added. Waiting for the project save to finish.'
                : 'Mapping review not yet saved.'}
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </section>

        <aside className="context-panel mapping-context" aria-labelledby="binding-heading">
          <h2 id="binding-heading">Review binding</h2>
          <dl className="facts">
            <div>
              <dt>Destination</dt>
              <dd>
                {project.name}
                <small>{c.policy ? String(c.policy.document.name ?? c.policy.path) : 'Policy not selected'}</small>
              </dd>
            </div>
            <div>
              <dt>Applicability</dt>
              <dd>
                {applicability.trim() ||
                  [intent?.role, intent?.ownership, intent?.platform].filter(Boolean).join(' · ') ||
                  'Not recorded'}
              </dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd>
                {workspaceId
                  ? (project.workspace_refs.find(reference => reference.id === workspaceId)?.name ?? workspaceId)
                  : 'Not attached'}
              </dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>
                <code>{c.state.revision}</code>
              </dd>
            </div>
          </dl>
          <p>Changing the profile, policy, configuration, value or applicability requires a fresh explicit review.</p>
        </aside>
      </div>

      <footer className="worksheet-footer">
        <button className="back-action" onClick={onBack}>
          <Arrow back />
          Back
        </button>
        {!savedMappings ? (
          <button
            className="primary"
            disabled={savingMappings || reviewedFields.size === 0 || !canReview}
            onClick={() => void saveReviewedMappings()}
          >
            {savingMappings ? 'Compiling & saving…' : 'Save reviewed mappings'}
            <Arrow />
          </button>
        ) : (
          <button className="primary" disabled={!mappingsPersisted} onClick={onContinue}>
            {mappingsPersisted ? 'Continue to artifacts' : 'Saving project…'}
            <Arrow />
          </button>
        )}
      </footer>
    </div>
  );
}

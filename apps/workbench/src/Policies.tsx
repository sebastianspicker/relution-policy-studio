import {useEffect, useState} from 'react';
import type {EditorController, Project, Section} from './types';
import {Alert, Empty, Field, Icon, JsonEditor, JsonView} from './ui';
import {request} from './api';
import {versionRecord, GeneratedFields, AppleSchemaFields, AppleCompatFields, MobileConfigFields} from 'rexp-studio/ui';
import {Mapping} from './Mapping';
import {Assurance} from './Assurance';
export function Policies({
  c,
  project,
  projectSaved,
  update,
  navigate,
  onWorkspaceChange,
}: {
  c: EditorController;
  project?: Project;
  projectSaved: boolean;
  update: (fn: (p: Project) => Project) => void;
  navigate: (s: Section) => void;
  onWorkspaceChange: () => void;
}) {
  const [tab, setTab] = useState('Editor');
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState(false);
  const [validated, setValidated] = useState('');
  const [error, setError] = useState('');
  const version = c.selection
    ? versionRecord(c.state.workspace, c.selection.policyIndex, c.selection.versionIndex)
    : undefined;
  const configs = (Array.isArray(version?.configurations) ? version.configurations : []) as Record<string, unknown>[];
  const fresh = validated === c.state.revision && !c.isDirty && c.state.validation.ok;
  async function validate() {
    try {
      const r = await request<{validation: {ok: boolean}}>('/api/workspace/validate', {workspace: c.state.workspace});
      if (r.validation.ok && !c.isDirty) setValidated(c.state.revision);
      else setError('Resolve validation errors and save policy changes before building.');
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <div className="section-action">
        <button onClick={() => void validate()} disabled={c.isDirty}>
          Validate
        </button>
        <button
          className="primary"
          disabled={!fresh || !c.state.keySet || c.isBuildLoading}
          onClick={() => void c.buildArchive()}
        >
          {c.isBuildLoading ? 'Building…' : 'Build archive'}
        </button>
      </div>
      <div className="tabs">
        {['Editor', 'Baselines', 'Recommendations', 'Compliance', 'Workspaces'].map(t => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      {tab === 'Workspaces' ? (
        <WorkspaceManager
          project={project}
          disabled={c.isDirty || !projectSaved}
          onWorkspaceChange={onWorkspaceChange}
        />
      ) : tab !== 'Editor' ? (
        <Assurance tab={tab} c={c} project={project} update={update} />
      ) : (
        <div className={'policy-layout ' + (detail ? 'detail-open' : '')}>
          <section className="configuration-list">
            <h2>Configurations</h2>
            <Field label="Policy">
              <select
                value={c.selection?.policyIndex ?? ''}
                onChange={e => c.setSelection({policyIndex: Number(e.target.value), versionIndex: 0})}
              >
                <option value="" disabled>
                  Select policy
                </option>
                {c.state.workspace.policies.map((p, i) => (
                  <option key={p.path} value={i}>
                    {String(p.document.name ?? p.path)}
                  </option>
                ))}
              </select>
            </Field>
            {Array.isArray(c.policy?.document.versions) && c.policy.document.versions.length > 1 && (
              <Field label="Version">
                <select
                  value={c.selection?.versionIndex ?? 0}
                  onChange={e =>
                    c.setSelection({policyIndex: c.selection!.policyIndex, versionIndex: Number(e.target.value)})
                  }
                >
                  {c.policy.document.versions.map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="search">
              <Icon name="search" />
              <input
                placeholder="Search configurations"
                aria-label="Search configurations"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <button className="wide" disabled={!c.policy || c.isDirty} onClick={() => setShowAdd(!showAdd)}>
              <Icon name="plus" />
              Add configuration
            </button>
            {showAdd && (
              <div className="add-configuration">
                <Field label="Configuration type">
                  <select value={c.selectedType} onChange={e => c.setSelectedType(e.target.value)}>
                    <option value="">Select configuration</option>
                    <optgroup label="Native">
                      {c.availableTemplates.map(t => (
                        <option key={t.type} value={'native:' + t.type}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Apple compatibility">
                      {c.availableAppleCompatSettings.map(t => (
                        <option key={t.id} value={'apple-compat:' + t.id}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Apple profiles">
                      {c.availableAppleSchemaProfiles.map(t => (
                        <option key={t.id} value={'apple-profile:' + t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                    <option value="custom-settings">Application & Custom Settings</option>
                  </select>
                </Field>
                <button
                  disabled={!c.selectedType}
                  onClick={() => {
                    void c.addConfiguration();
                    setShowAdd(false);
                  }}
                >
                  Add selected configuration
                </button>
              </div>
            )}
            <div className="config-rows">
              {configs
                .map((r, i) => ({r, i}))
                .filter(({r}) =>
                  String(r.name ?? (r.details as Record<string, unknown>)?.type ?? '')
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map(({r, i}) => (
                  <button
                    key={String(r.uuid ?? i)}
                    className={c.selection?.configurationIndex === i ? 'selected' : ''}
                    onClick={() => {
                      c.setSelection({...c.selection!, configurationIndex: i});
                      setDetail(true);
                    }}
                  >
                    {String(
                      r.name ??
                        c.templatesByType.get(String((r.details as Record<string, unknown>)?.type))?.label ??
                        (r.details as Record<string, unknown>)?.type ??
                        'Configuration',
                    )}
                    <Icon name="arrow" />
                  </button>
                ))}
            </div>
            {!configs.length && <p className="muted">No configurations in this policy.</p>}
            <details>
              <summary>Add policy</summary>
              <Field label="Policy name">
                <input value={c.newPolicyName} onChange={e => c.setNewPolicyName(e.target.value)} />
              </Field>
              <Field label="Platform">
                <select value={c.newPolicyPlatform} onChange={e => c.setNewPolicyPlatform(e.target.value)}>
                  <option value="">Select platform</option>
                  {c.creatablePlatforms.map(p => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <button
                disabled={!c.newPolicyName.trim() || !c.newPolicyPlatform || c.isDirty}
                onClick={() => void c.addPolicy()}
              >
                Create policy
              </button>
            </details>
            {c.policy && (
              <details>
                <summary>Policy details</summary>
                <Field label="Name">
                  <input
                    value={String(c.policy.document.name ?? '')}
                    onChange={e => c.renameSelectedPolicy(e.target.value)}
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={String(c.policy.document.description ?? '')}
                    onChange={e => c.updateSelectedPolicyDescription(e.target.value)}
                  />
                </Field>
                <button onClick={c.duplicateSelectedPolicy}>Duplicate policy</button>
                <button className="danger" onClick={c.deleteSelectedPolicy}>
                  Delete policy
                </button>
              </details>
            )}
          </section>
          <section className="configuration-editor">
            <button className="back" onClick={() => setDetail(false)}>
              <Icon name="back" />
              All configurations
            </button>
            {c.configuration && c.details ? (
              <>
                <h2>
                  {c.template?.label ?? c.appleSchemaProfile?.title ?? c.appleCompatSetting?.label ?? 'Configuration'}
                </h2>
                <p>
                  {String(c.policy?.document.platform ?? '')} ·{' '}
                  {c.appleSchemaProfile
                    ? 'Apple profile'
                    : c.appleCompatSetting
                      ? 'Apple compatibility'
                      : 'Native configuration'}
                </p>
                <p className="muted">Source: Relution {c.state.bundle.serverVersion} reference</p>
                <ConfigurationFields c={c} />
                <details>
                  <summary>Technical fields</summary>
                  <JsonEditor
                    key={JSON.stringify(c.selection)}
                    label="Configuration JSON"
                    value={c.configuration}
                    onApply={v => {
                      if (!v || typeof v !== 'object' || Array.isArray(v))
                        throw new Error('Use a configuration object');
                      c.updateSelectedConfiguration(v as Record<string, unknown>);
                    }}
                  />
                </details>
                <div className="inline-actions">
                  <button
                    disabled={!c.selection || c.isDirty}
                    onClick={() => void c.moveConfiguration(c.selection!, 'up')}
                  >
                    Move up
                  </button>
                  <button
                    disabled={!c.selection || c.isDirty}
                    onClick={() => void c.moveConfiguration(c.selection!, 'down')}
                  >
                    Move down
                  </button>
                  <button
                    className="danger"
                    disabled={!c.selection || c.isDirty}
                    onClick={() => void c.removeConfiguration(c.selection!)}
                  >
                    Remove configuration
                  </button>
                </div>
              </>
            ) : (
              <Empty title="Select a configuration">Add a configuration or select one to edit its fields.</Empty>
            )}
            <div className="savebar">
              <button className="primary" disabled={!c.isDirty} onClick={() => void c.saveWorkspace()}>
                Save changes
              </button>
              <button disabled={!c.canUndo} onClick={c.undoWorkspace}>
                Undo
              </button>
              <button disabled={!c.canRedo} onClick={c.redoWorkspace}>
                Redo
              </button>
            </div>
          </section>
          <aside className="inspector">
            <h2>Intent & evidence</h2>
            {project ? <Mapping project={project} update={update} c={c} /> : <p>Open a project to map intent.</p>}
            <h3>Validation</h3>
            <dl className="facts">
              <div>
                <dt>Schema</dt>
                <dd>{fresh ? 'Passed' : c.isDirty ? 'Stale' : 'Not run'}</dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>{c.isDirty ? 'Unsaved' : 'Saved'}</dd>
              </div>
              <div>
                <dt>Device result</dt>
                <dd>Not assessed</dd>
              </div>
            </dl>
            <p>
              {!c.state.keySet
                ? 'Set an archive passphrase in Settings before building.'
                : 'Validate the saved revision before building an archive.'}
            </p>
            {c.state.validation.errors.length > 0 && (
              <details>
                <summary>{c.state.validation.errors.length} validation errors</summary>
                <JsonView value={c.state.validation.errors} />
              </details>
            )}
            <h3>Related evidence</h3>
            <Empty title="Review evidence">
              <button onClick={() => navigate('Evidence')}>Add evidence</button>
            </Empty>
          </aside>
        </div>
      )}
    </>
  );
}
function ConfigurationFields({c}: {c: EditorController}) {
  const details = c.details!;
  const onChange = (next: Record<string, unknown>) =>
    c.updateSelectedConfiguration({...c.configuration, details: next});
  if (c.appleSchemaProfile)
    return (
      <AppleSchemaFields entry={c.appleSchemaProfile} details={details} onChange={onChange} onError={c.setStatus} />
    );
  if (c.appleCompatSetting)
    return (
      <AppleCompatFields setting={c.appleCompatSetting} details={details} onChange={onChange} onError={c.setStatus} />
    );
  if (details.type === 'APPLE_MOBILECONFIG')
    return <MobileConfigFields details={details} onChange={onChange} onError={c.setStatus} />;
  return c.template ? (
    <GeneratedFields template={c.template} details={details} onChange={onChange} />
  ) : (
    <p>Use technical fields for this unsupported configuration type.</p>
  );
}
function WorkspaceManager({
  project,
  disabled,
  onWorkspaceChange,
}: {
  project?: Project;
  disabled: boolean;
  onWorkspaceChange: () => void;
}) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [error, setError] = useState('');
  const [workspaces, setWorkspaces] = useState<unknown>();
  useEffect(() => {
    if (project)
      void request('/api/campusweave/workspaces?projectId=' + encodeURIComponent(project.id))
        .then(setWorkspaces)
        .catch(e => setError(String(e)));
  }, [project?.id]);
  if (!project) return <Empty title="Open a project first" />;
  return (
    <div className="page-body">
      <h2>Policy workspaces</h2>
      <p>Workspace creation and project attachment are separate operations. Partial results remain visible.</p>
      <Field label="Workspace name">
        <input value={name} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label="Platform">
        <select value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="">Select platform</option>
          {['MACOS', 'IOS', 'WINDOWS', 'ANDROID_ENTERPRISE'].map(v => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <button
        disabled={disabled || !name.trim() || !platform}
        onClick={() =>
          void request('/api/campusweave/workspaces', {
            projectId: project.id,
            expectedRevision: project.revision,
            name,
            platform,
          })
            .then(r => {
              setWorkspaces(r);
              onWorkspaceChange();
            })
            .catch(e => setError(String(e)))
        }
      >
        Create workspace
      </button>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Workspace</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {project.workspace_refs.map(w => (
            <tr key={w.id}>
              <td>{w.name ?? w.id}</td>
              <td>{w.id}</td>
              <td>
                <button
                  disabled={disabled}
                  onClick={() =>
                    void request('/api/campusweave/workspaces/activate', {projectId: project.id, workspaceId: w.id})
                      .then(() => onWorkspaceChange())
                      .catch(e => setError(String(e)))
                  }
                >
                  Open workspace
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {project.operations
        .filter(operation => operation.status !== 'committed')
        .map((operation, index) => (
          <section key={typeof operation.id === 'string' ? operation.id : index}>
            <h3>Workspace recovery: {String(operation.name ?? operation.id)}</h3>
            <p>
              The workspace and project attachment did not complete together. Recovery verifies the stored workspace
              before attaching it.
            </p>
            <button
              disabled={disabled}
              onClick={() =>
                void request('/api/campusweave/workspaces/recover', {
                  projectId: project.id,
                  expectedRevision: project.revision,
                  operationId: operation.id,
                })
                  .then(onWorkspaceChange)
                  .catch(e => setError(String(e)))
              }
            >
              Recover workspace attachment
            </button>
            <JsonView value={operation} />
          </section>
        ))}
      {error && (
        <p role="alert">
          {error}{' '}
          <button disabled={disabled} onClick={onWorkspaceChange}>
            Reload operation state
          </button>
        </p>
      )}
      {workspaces !== undefined && (
        <details>
          <summary>Operation results</summary>
          <JsonView value={workspaces} />
        </details>
      )}
    </div>
  );
}

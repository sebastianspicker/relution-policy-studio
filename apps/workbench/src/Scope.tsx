import {useEffect, useRef, useState} from 'react';
import type {AssuranceCatalogBundle, AssuranceCatalogLoadResult} from 'rexp-studio/browser';
import type {EditorController, Project, Section} from './types';
import {Alert, Field, Icon, JsonView} from './ui';
import {download, planner, request} from './api';
import {applyScopeDraft, platformOptions, scopeDraft, type ScopeDraft} from './scope-model';

interface Props {
  project: Project;
  c: EditorController;
  status: string;
  update: (change: (project: Project) => Project) => void;
  flush: () => Promise<Project | undefined>;
  navigate: (section: Section) => void;
  reloadWorkspace: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function Scope({project, c, status, update, flush, navigate, reloadWorkspace, onDirtyChange}: Props) {
  const [draft, setDraft] = useState(() =>
    scopeDraft(project, sessionStorage.getItem('campusweave:intent:' + project.id) ?? undefined),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState<unknown>();
  const [workspace, setWorkspace] = useState(() => {
    const active = c.state.active_workspace_id;
    return project.workspace_refs.some(row => row.id === active)
      ? active!
      : String(project.workspace_refs[0]?.id ?? 'new');
  });
  const [bundle, setBundle] = useState<AssuranceCatalogBundle>();
  const [sourceError, setSourceError] = useState('');
  const [recommendation, setRecommendation] = useState(
    () => sessionStorage.getItem('campusweave:recommendation:' + project.id) ?? '',
  );
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceRetry, setSourceRetry] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const editBase = useRef<string | undefined>(undefined);
  const live = useRef(project);
  live.current = project;
  const platform = platformOptions.find(option => option[0] === draft.platform)?.[2];
  const choices =
    bundle?.catalog.recommendations.filter(
      row =>
        row.selectable &&
        (!platform || row.platform === platform) &&
        (!sourceQuery || (row.title + row.id).toLowerCase().includes(sourceQuery.toLowerCase())),
    ) ?? [];
  const chosen = bundle?.catalog.recommendations.find(row => row.id === recommendation);
  const options = choices.slice(0, 200);
  if (chosen && !options.some(row => row.id === chosen.id)) options.unshift(chosen);

  useEffect(() => {
    const saved = sessionStorage.getItem('campusweave:recommendation:' + project.id);
    if (saved !== null) setRecommendation(saved);
  }, [project.id]);
  useEffect(() => {
    if (!dirty) setDraft(current => scopeDraft(project, current.intentId));
  }, [project.profile, dirty]);
  useEffect(() => {
    let active = true;
    setSourceError('');
    void request<AssuranceCatalogLoadResult>('/api/assurance/catalog')
      .then(result => {
        if (result.status !== 'available') throw new Error(result.error);
        if (active) setBundle(result);
      })
      .catch(cause => {
        if (active) setSourceError(String(cause));
      });
    return () => {
      active = false;
    };
  }, [sourceRetry]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  function edit<K extends keyof ScopeDraft>(key: K, value: ScopeDraft[K]) {
    if (!dirty) editBase.current = JSON.stringify(project.profile);
    setDraft(current => ({...current, [key]: value}));
    onDirtyChange(true);
    setDirty(true);
    setError('');
  }
  async function save() {
    if (dirty && editBase.current !== JSON.stringify(live.current.profile))
      throw new Error(
        'The profile changed in another tool. Export this scope draft before reloading the saved profile and reapplying your changes.',
      );
    update(current => ({...current, profile: applyScopeDraft(current.profile, draft), compiled_plan: null}));
    const saved = await flush();
    if (!saved) throw new Error('Open a project before saving.');
    setDirty(false);
    onDirtyChange(false);
    sessionStorage.setItem('campusweave:intent:' + project.id, draft.intentId);
    return saved;
  }
  async function submit(continueFlow: boolean) {
    if (continueFlow && !form.current?.reportValidity()) return;
    setBusy(continueFlow ? 'Compiling plan…' : 'Saving draft…');
    setError('');
    try {
      const saved = dirty || !project.profile.intents.length ? await save() : await flush();
      if (!saved) throw new Error('Open a project before compiling.');
      if (!continueFlow) return;
      if (c.isDirty) throw new Error('Save the policy draft before creating or switching workspaces.');
      const profileKey = JSON.stringify(saved.profile);
      const compilation = await planner<Record<string, unknown>>('compile', {profile: saved.profile});
      if (JSON.stringify(live.current.profile) !== profileKey)
        throw new Error('The profile changed during compilation. Compile the current profile again.');
      update(current => ({...current, compiled_plan: compilation}));
      const compiled = await flush();
      setDiagnostics(compilation);
      if (compilation.valid !== true)
        throw new Error('Resolve the planning diagnostics before continuing. Your draft is saved.');
      if (!compiled) throw new Error('The compiled project was not saved.');
      sessionStorage.setItem('campusweave:intent:' + project.id, draft.intentId);
      sessionStorage.setItem('campusweave:recommendation:' + project.id, recommendation);
      if (workspace === 'new') {
        if (!platform) throw new Error('Choose a supported policy platform, or manage workspaces in Project tools.');
        setBusy('Creating policy workspace…');
        await request('/api/campusweave/workspaces', {
          projectId: compiled.id,
          expectedRevision: compiled.revision,
          name: draft.name,
          platform,
        });
        reloadWorkspace();
      } else {
        const activeId = c.state.active_workspace_id;
        if (!compiled.workspace_refs.some(row => row.id === workspace))
          throw new Error('Select a workspace attached to this project.');
        if (workspace !== activeId) {
          await request('/api/campusweave/workspaces/activate', {projectId: compiled.id, workspaceId: workspace});
          reloadWorkspace();
        } else navigate('Changes');
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy('');
    }
  }

  return (
    <form
      ref={form}
      className="scope-screen worksheet"
      onSubmit={event => {
        event.preventDefault();
        void submit(true);
      }}
    >
      <div className="worksheet-grid">
        <section>
          <header className="worksheet-heading">
            <h1>Define the scope</h1>
            <p>{draft.name || 'Define the intended policy outcome.'}</p>
          </header>
          {project.profile.intents.length > 1 && (
            <Field label="Selected intent">
              <select
                value={draft.intentId}
                disabled={dirty || !!busy}
                onChange={event => setDraft(scopeDraft(project, event.target.value))}
              >
                {project.profile.intents.map(row => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <fieldset className="scope-fields" disabled={!!busy}>
            <legend className="sr-only">Policy intent and scope</legend>
            <Field label="Intent">
              <input required value={draft.name} onChange={event => edit('name', event.target.value)} />
            </Field>
            <Field label="Outcome">
              <input required value={draft.outcome} onChange={event => edit('outcome', event.target.value)} />
            </Field>
            {(['organization', 'location', 'cohort'] as const).map((key, index) => (
              <Field key={key} label={key[0].toUpperCase() + key.slice(1)}>
                <input
                  required
                  list={'scope-' + key}
                  value={draft[key]}
                  onChange={event => edit(key, event.target.value)}
                />
                <datalist id={'scope-' + key}>
                  {project.profile[(['organizations', 'locations', 'cohorts'] as const)[index]].map(row => (
                    <option key={row.id} value={row.name} />
                  ))}
                </datalist>
              </Field>
            ))}
            <Field label="Ownership">
              <input
                required
                list="scope-ownership"
                value={draft.ownership}
                onChange={event => edit('ownership', event.target.value)}
              />
              <datalist id="scope-ownership">
                <option value="institution" />
                <option value="personal" />
              </datalist>
            </Field>
            <Field label="Platform">
              <select required value={draft.platform} onChange={event => edit('platform', event.target.value)}>
                <option value="">Select platform</option>
                {platformOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {draft.platform && !platformOptions.some(([value]) => value === draft.platform) && (
                  <option value={draft.platform}>{draft.platform}</option>
                )}
              </select>
            </Field>
            <Field label="Scope">
              <input
                required
                list="scope-blueprints"
                value={draft.scope}
                onChange={event => edit('scope', event.target.value)}
              />
              <datalist id="scope-blueprints">
                {project.profile.scope_blueprints.map(row => (
                  <option key={row.id} value={row.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Review stage">
              <input
                required
                list="scope-stages"
                value={draft.stage}
                onChange={event => edit('stage', event.target.value)}
              />
              <datalist id="scope-stages">
                {project.profile.rollout_stages.map(row => (
                  <option key={row.id} value={row.name} />
                ))}
              </datalist>
            </Field>
          </fieldset>
          <details className="scope-advanced">
            <summary>Additional scope and planning details</summary>
            <div className="two-columns">
              <Field label="Functional role">
                <input value={draft.role} disabled={!!busy} onChange={event => edit('role', event.target.value)} />
              </Field>
              <Field label="Policy layer">
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={draft.layer ?? ''}
                  disabled={!!busy}
                  onChange={event => edit('layer', event.target.value === '' ? null : event.target.valueAsNumber)}
                />
              </Field>
            </div>
            <p className="muted">
              Existing shared records, additional scope references, requirements and dependencies are preserved. Edit
              their constraints in the institution and intent tools. Changing platform, ownership or cohort can conflict
              with a reused scope; the compiler reports those conflicts. Blank draft fields retain existing references.
            </p>
            <button type="button" onClick={() => navigate('Institution')}>
              Institution tools
            </button>
            <button type="button" onClick={() => navigate('Intent')}>
              All intents
            </button>
          </details>
          <fieldset className="workspace-choice" disabled={!!busy || c.isDirty}>
            <legend>Policy workspace</legend>
            <label className="checkbox">
              <input
                type="radio"
                name="scope-workspace"
                checked={workspace === 'new'}
                onChange={() => setWorkspace('new')}
              />
              <span>
                Create new {platform === 'IOS' ? 'iOS ' : ''}workspace<small>Set up a workspace for this policy.</small>
              </span>
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="scope-workspace"
                disabled={!project.workspace_refs.length}
                checked={workspace !== 'new'}
                onChange={() => setWorkspace(project.workspace_refs[0]?.id ?? 'new')}
              />
              <span>
                Use existing workspace<small>Reuse an attached policy workspace.</small>
              </span>
            </label>
            {workspace !== 'new' && (
              <Field label="Existing workspace">
                <select value={workspace} onChange={event => setWorkspace(event.target.value)}>
                  {project.workspace_refs.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.name ?? row.id}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </fieldset>
          {c.isDirty && <Alert>Save policy changes in Save &amp; map before switching workspaces.</Alert>}
          <div className="recommendation-choice">
            <Field label="Recommendation">
              <select
                value={recommendation}
                onChange={event => {
                  setRecommendation(event.target.value);
                  sessionStorage.setItem('campusweave:recommendation:' + project.id, event.target.value);
                }}
                disabled={!bundle || !!busy}
              >
                <option value="">Choose during review</option>
                {options.map(row => (
                  <option key={row.id} value={row.id}>
                    {row.title} · {row.sourceRecommendationId}
                  </option>
                ))}
              </select>
            </Field>
            {bundle && (choices.length > 200 || sourceQuery) && (
              <details>
                <summary>Find another recommendation</summary>
                <Field label="Find recommendation">
                  <input
                    value={sourceQuery}
                    onChange={event => setSourceQuery(event.target.value)}
                    placeholder="Filter by title or source identifier"
                  />
                </Field>
              </details>
            )}
          </div>
          {error && (
            <div role="alert">
              <Alert>{error}</Alert>
              {dirty && (
                <div className="inline-actions">
                  <button type="button" onClick={() => download(draft, 'scope-draft-recovery.json')}>
                    Export scope draft
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(scopeDraft(project, draft.intentId));
                      setDirty(false);
                      onDirtyChange(false);
                      setError('');
                    }}
                  >
                    Reload saved profile
                  </button>
                </div>
              )}
            </div>
          )}
          {diagnostics !== undefined && (
            <details open={!!error}>
              <summary>Planning diagnostics</summary>
              <JsonView value={diagnostics} />
            </details>
          )}
        </section>
        <aside className="context-panel">
          <h2>Plan boundaries</h2>
          <dl className="facts">
            <div>
              <dt>Intent</dt>
              <dd>{draft.name ? 'Defined' : 'Not defined'}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>Abstract</dd>
            </div>
            <div>
              <dt>Device membership</dt>
              <dd>Not verified</dd>
            </div>
          </dl>
          <p>This scope describes the intended audience. It does not bind live devices.</p>
          <section className="context-section">
            <h2 className="source-heading">Source snapshot</h2>
            {chosen ? (
              <>
                <strong>{chosen.sourceRecommendationId}</strong>
                <p>{chosen.title}</p>
                <span className="badge warning-badge">
                  <Icon name="info" size={18} />
                  Freshness {chosen.refresh.freshnessState}
                </span>
              </>
            ) : (
              <p>
                {bundle
                  ? 'Choose a recommendation here or during review.'
                  : sourceError
                    ? 'Source catalog unavailable.'
                    : 'Loading source catalog…'}
              </p>
            )}
            {sourceError && (
              <>
                <p role="alert">{sourceError}</p>
                <button type="button" onClick={() => setSourceRetry(value => value + 1)}>
                  Retry sources
                </button>
              </>
            )}
          </section>
        </aside>
      </div>
      <footer className="worksheet-footer">
        <button type="button" onClick={() => navigate('Overview')}>
          <Icon name="back" />
          Back
        </button>
        <div className="inline-actions">
          <span className="muted" role="status">
            {busy ||
              (dirty
                ? 'Scope changes not saved yet'
                : status === 'Saved locally'
                  ? 'Profile draft saved locally'
                  : status)}
          </span>
          <button type="button" disabled={!!busy} onClick={() => void submit(false)}>
            Save draft
          </button>
          <button className="primary" disabled={!!busy || c.isDirty} type="submit">
            Compile &amp; continue
            <Icon name="arrow" />
          </button>
        </div>
      </footer>
    </form>
  );
}

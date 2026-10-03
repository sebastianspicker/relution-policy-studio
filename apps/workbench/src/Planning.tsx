import {useEffect, useRef, useState} from 'react';
import {Empty, Field, Icon, JsonEditor, Stamp, StringList} from './ui';
import {
  blankIntent,
  type Intent,
  type Profile,
  type Project,
  type ProjectSummary,
  type Row,
  type Section,
} from './types';
import {planner, download} from './api';
export function Overview({
  project,
  projects,
  openBlocked,
  open,
  create,
  navigate,
}: {
  project?: Project;
  projects: ProjectSummary[];
  openBlocked: boolean;
  open: (id: string) => Promise<void>;
  create: (name: string, reference: boolean) => Promise<void>;
  navigate: (s: Section) => void;
}) {
  const [name, setName] = useState('');
  const [reference, setReference] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openError, setOpenError] = useState('');
  return (
    <div className="worksheet overview">
      <div className="worksheet-grid">
        <section>
          <header className="worksheet-heading">
            <h1>Projects</h1>
            <p>
              One project plans device policy for one institution, from intended outcome to a reviewed archive. Projects
              stay in this machine’s private data directory.
            </p>
          </header>
          {project && (
            <section className="current-project" aria-labelledby="current-project-name">
              <p className="eyebrow">Open in this tab</p>
              <h2 id="current-project-name">{project.name}</h2>
              <dl className="ledger">
                <div>
                  <dt>Policy intents</dt>
                  <dd>{project.profile.intents.length}</dd>
                </div>
                <div>
                  <dt>Workspaces</dt>
                  <dd>{project.workspace_refs.length}</dd>
                </div>
                <div>
                  <dt>Evidence records</dt>
                  <dd>{project.evidence.length}</dd>
                </div>
                <div>
                  <dt>Revision</dt>
                  <dd>{project.revision}</dd>
                </div>
              </dl>
              <p className="authority-note">
                <span className="badge">Prepared only</span>
                Drafts can be saved unfinished. Planning and local checks do not authorize deployment.
              </p>
              <button className="primary" onClick={() => navigate('Scope')}>
                Continue at Scope
                <Icon name="arrow" size={18} />
              </button>
            </section>
          )}
          <section className="project-register" aria-labelledby="project-register">
            <h2 id="project-register">On this machine</h2>
            {projects.length ? (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Project</th>
                    <th scope="col" className="numeric">
                      Revision
                    </th>
                    <th scope="col" className="numeric">
                      Workspaces
                    </th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(row => (
                    <tr key={row.id} className={row.id === project?.id ? 'selected' : ''}>
                      <td>
                        <strong className="register-name">{row.name}</strong>
                        <span className="identifier">{row.id}</span>
                      </td>
                      <td className="numeric">{row.revision ?? '—'}</td>
                      <td className="numeric">{row.workspace_count ?? '—'}</td>
                      <td className="register-action">
                        {row.id === project?.id ? (
                          <span className="badge">Open</span>
                        ) : (
                          <button
                            disabled={openBlocked}
                            aria-label={'Open ' + row.name}
                            onClick={() => {
                              setOpenError('');
                              void open(row.id)
                                .then(() => navigate('Scope'))
                                .catch(cause => setOpenError(String(cause)));
                            }}
                          >
                            Open
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty title="No projects yet">
                Create the first one from a blank profile or the institution reference.
              </Empty>
            )}
            {openBlocked && projects.length > 1 && (
              <p className="muted">Save the open project and any policy draft before switching.</p>
            )}
            {openError && (
              <p role="alert" className="inline-error">
                {openError}
              </p>
            )}
          </section>
        </section>
        <aside className="context-panel">
          <h2>New project</h2>
          <form
            className="create-form"
            onSubmit={e => {
              e.preventDefault();
              setBusy(true);
              void create(name, reference)
                .catch(e => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            <Field label="Project name">
              <input required maxLength={160} value={name} onChange={e => setName(e.target.value)} />
            </Field>
            <Field label="Starting data">
              <select value={String(reference)} onChange={e => setReference(e.target.value === 'true')}>
                <option value="false">Blank project</option>
                <option value="true">Institution reference</option>
              </select>
            </Field>
            <p className="muted">
              The reference is an editable example institution. Ambiguities carried over from legacy profiles stay open
              for review.
            </p>
            <button className="primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create project'}
            </button>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
          </form>
        </aside>
      </div>
    </div>
  );
}
const collections = [
  'organizations',
  'locations',
  'cohorts',
  'scope_blueprints',
  'assignments',
  'rollout_stages',
] as const;
const labels: Record<string, string> = {
  organizations: 'Organizations',
  locations: 'Locations',
  cohorts: 'Cohorts',
  scope_blueprints: 'Scope blueprints',
  assignments: 'Assignments',
  rollout_stages: 'Rollout stages',
};
type Collection = (typeof collections)[number];
const singular: Record<Collection, string> = {
  organizations: 'organization',
  locations: 'location',
  cohorts: 'cohort',
  scope_blueprints: 'scope blueprint',
  assignments: 'assignment',
  rollout_stages: 'rollout stage',
};
function newRecord(collection: Collection): Row {
  const common = {id: crypto.randomUUID(), name: 'New ' + singular[collection], requirements: []};
  switch (collection) {
    case 'organizations':
      return {...common, parent_id: null, description: null};
    case 'locations':
      return {...common, organization_id: null, description: null};
    case 'cohorts':
      return {...common, organization_id: null, location_ids: [], role: null, ownership: null};
    case 'scope_blueprints':
      return {
        ...common,
        cohort_ids: [],
        organization_ids: [],
        location_ids: [],
        platforms: [],
        ownerships: [],
        roles: [],
        depends_on: [],
      };
    case 'assignments':
      return {...common, intent_id: '', scope_id: '', rollout_stage_id: null};
    case 'rollout_stages':
      return {...common, order: 0, depends_on: []};
  }
}
function Reference({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: unknown;
  rows: Row[];
  onChange: (id: string) => void;
}) {
  const id = typeof value === 'string' ? value : '';
  return (
    <Field label={label}>
      <select value={id} onChange={e => onChange(e.target.value)}>
        <option value="">Unresolved</option>
        {id && !rows.some(r => r.id === id) && <option value={id}>Missing record: {id}</option>}
        {rows.map(r => (
          <option key={r.id} value={r.id}>
            {r.name || r.id}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Institution({project, update}: {project: Project; update: (fn: (p: Project) => Project) => void}) {
  const [collection, setCollection] = useState<Collection>('organizations');
  const [selected, setSelected] = useState<string>();
  const opener = useRef<HTMLButtonElement | null>(null);
  const rows = project.profile[collection];
  const row = rows.find(r => r.id === selected);
  const backButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected && matchMedia('(max-width:760px)').matches) backButton.current?.focus();
  }, [selected]);
  function setRows(next: Row[]) {
    update(p => ({...p, profile: {...p.profile, [collection]: next}, compiled_plan: null}));
  }
  function edit(patch: Partial<Row>) {
    setRows(rows.map(r => (r.id === selected ? {...r, ...patch} : r)));
  }
  function back() {
    setSelected(undefined);
    requestAnimationFrame(() => opener.current?.focus());
  }
  const references: Record<string, Row[]> = {
    parent_id: project.profile.organizations.filter(r => r.id !== selected),
    organization_id: project.profile.organizations,
    intent_id: project.profile.intents,
    scope_id: project.profile.scope_blueprints,
    rollout_stage_id: project.profile.rollout_stages,
  };
  const arrays: Record<string, Row[] | undefined> = {
    location_ids: project.profile.locations,
    cohort_ids: project.profile.cohorts,
    organization_ids: project.profile.organizations,
    depends_on: rows.filter(r => r.id !== selected),
  };
  const label = (key: string) =>
    key
      .replace(/_ids?$/, '')
      .replaceAll('_', ' ')
      .replace(/^./, c => c.toUpperCase());
  return (
    <>
      <div className="tabs" aria-label="Institution collections">
        {collections.map(c => (
          <button
            key={c}
            aria-pressed={collection === c}
            className={collection === c ? 'active' : ''}
            onClick={() => {
              setCollection(c);
              setSelected(undefined);
            }}
          >
            {labels[c]}
          </button>
        ))}
      </div>
      <div className={'split institution-split ' + (row ? 'detail-open' : '')}>
        <section className="table-pane">
          <div className="filterbar">
            <Field label="Institution name">
              <input
                value={project.profile.name}
                onChange={e =>
                  update(p => ({
                    ...p,
                    name: e.target.value,
                    profile: {...p.profile, name: e.target.value},
                    compiled_plan: null,
                  }))
                }
              />
            </Field>
            <button
              onClick={e => {
                opener.current = e.currentTarget;
                const next = newRecord(collection);
                setRows([...rows, next]);
                setSelected(next.id);
              }}
            >
              <Icon name="plus" />
              Add {singular[collection]}
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Identifier</th>
                <th aria-label="Details" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={r.id === selected ? 'selected' : ''}>
                  <td>
                    <button
                      className="row-button"
                      onClick={e => {
                        opener.current = e.currentTarget;
                        setSelected(r.id);
                      }}
                    >
                      {r.name || 'Unnamed'}
                    </button>
                  </td>
                  <td className="muted identifier">{r.id}</td>
                  <td>
                    <Icon name="arrow" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <Empty title={'No ' + labels[collection].toLowerCase()}>
              Add records as your planning scope becomes clear.
            </Empty>
          )}
        </section>
        <aside className="inspector">
          <button ref={backButton} className="back" onClick={back}>
            <Icon name="back" />
            All {labels[collection].toLowerCase()}
          </button>
          {row ? (
            <>
              <h2>{row.name}</h2>
              <Field label="Name">
                <input value={row.name ?? ''} onChange={e => edit({name: e.target.value})} />
              </Field>
              {Object.entries(row)
                .filter(([k]) => !['id', 'name', 'requirements'].includes(k))
                .map(([key, value]) => {
                  if (key in references)
                    return (
                      <Reference
                        key={key}
                        label={label(key)}
                        value={value}
                        rows={references[key]}
                        onChange={id => edit({[key]: id || (['intent_id', 'scope_id'].includes(key) ? '' : null)})}
                      />
                    );
                  if (Array.isArray(value))
                    return (
                      <StringList
                        key={row.id + key}
                        label={label(key)}
                        value={value}
                        options={arrays[key]}
                        onChange={v => edit({[key]: v})}
                      />
                    );
                  if (key === 'order')
                    return (
                      <Field key={key} label="Stage order">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={Number(value)}
                          onChange={e => {
                            if (
                              e.target.value !== '' &&
                              Number.isSafeInteger(e.target.valueAsNumber) &&
                              e.target.valueAsNumber >= 0
                            )
                              edit({order: e.target.valueAsNumber});
                          }}
                        />
                      </Field>
                    );
                  return (
                    <Field key={key} label={label(key)}>
                      <input
                        value={typeof value === 'string' ? value : ''}
                        placeholder="Unresolved"
                        onChange={e => edit({[key]: e.target.value || null})}
                      />
                    </Field>
                  );
                })}
              <StringList
                key={row.id + 'requirements'}
                label="Requirements"
                value={Array.isArray(row.requirements) ? row.requirements : []}
                onChange={v => edit({requirements: v})}
              />
              <p className="muted">
                References use stable record identifiers. Unresolved assignment references remain drafts until selected.
              </p>
              <details>
                <summary>Advanced record fields</summary>
                <JsonEditor
                  key={JSON.stringify(row)}
                  label="Record fields"
                  value={row}
                  onApply={v => {
                    if (!v || typeof v !== 'object' || Array.isArray(v) || (v as Row).id !== row.id)
                      throw new Error('Keep the stable record id');
                    setRows(rows.map(r => (r.id === row.id ? (v as Row) : r)));
                  }}
                />
              </details>
              <button
                className="danger"
                onClick={() => {
                  setRows(rows.filter(r => r.id !== row.id));
                  back();
                }}
              >
                Delete record
              </button>
            </>
          ) : (
            <Empty title="Select a record">Edit its name, references and planning details.</Empty>
          )}
        </aside>
      </div>
    </>
  );
}
export function IntentScreen({
  project,
  update,
  navigate,
}: {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  navigate: (s: Section) => void;
}) {
  const [selected, setSelected] = useState<string | undefined>(project.profile.intents[0]?.id);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const [opened, setOpened] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const backButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (opened && matchMedia('(max-width:760px)').matches) backButton.current?.focus();
  }, [opened, selected]);
  const intent = project.profile.intents.find(i => i.id === selected);
  const rows = project.profile.intents.filter(
    i =>
      (!platform || i.platform === platform) && (i.name + ' ' + i.outcome).toLowerCase().includes(query.toLowerCase()),
  );
  function edit(patch: Partial<Intent>) {
    update(p => ({
      ...p,
      profile: {...p.profile, intents: p.profile.intents.map(i => (i.id === selected ? {...i, ...patch} : i))},
      compiled_plan: null,
    }));
  }
  return (
    <>
      <div className="section-action">
        <button
          className="primary"
          onClick={e => {
            opener.current = e.currentTarget;
            setOpened(true);
            const i = blankIntent();
            update(p => ({...p, profile: {...p.profile, intents: [...p.profile.intents, i]}, compiled_plan: null}));
            setSelected(i.id);
          }}
        >
          Add intent
        </button>
      </div>
      <div className={'split intent-split ' + (intent && opened ? 'detail-open' : '')}>
        <section className="table-pane">
          <div className="filterbar">
            <select aria-label="Filter platform" value={platform} onChange={e => setPlatform(e.target.value)}>
              <option value="">All platforms</option>
              {[...new Set(project.profile.intents.map(i => i.platform).filter(Boolean))].map(v => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <div className="search">
              <Icon name="search" />
              <input
                aria-label="Search intent"
                placeholder="Search intent"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Intent</th>
                <th>Scope</th>
                <th>Policy mapping</th>
                <th>Evidence</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(i => (
                <tr className={i.id === selected ? 'selected' : ''} key={i.id}>
                  <td>
                    <button
                      className="row-button"
                      onClick={e => {
                        opener.current = e.currentTarget;
                        setSelected(i.id);
                        setOpened(true);
                      }}
                    >
                      {i.name || 'Untitled intent'}
                    </button>
                  </td>
                  <td>{[i.platform, i.ownership].filter(Boolean).join(' · ') || <Stamp>Unresolved</Stamp>}</td>
                  <td>
                    {project.mappings.some(m => m.intent_id === i.id) ? (
                      <Stamp tone="caution">Needs review</Stamp>
                    ) : (
                      <Stamp>Needs mapping</Stamp>
                    )}
                  </td>
                  <td>
                    {project.evidence.some(e => e.intent_id === i.id) ? (
                      <Stamp tone="caution">Review evidence</Stamp>
                    ) : (
                      <Stamp>Not assessed</Stamp>
                    )}
                  </td>
                  <td>
                    <Icon name="arrow" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <Empty title="No policy intent">Add an outcome to begin. You can save incomplete intent.</Empty>
          )}
        </section>
        <aside className="inspector">
          <button
            ref={backButton}
            className="back"
            onClick={() => {
              setOpened(false);
              requestAnimationFrame(() => opener.current?.focus());
            }}
          >
            <Icon name="back" />
            All intent
          </button>
          {intent ? (
            <>
              <h2 className="editable-heading">
                <input aria-label="Intent name" value={intent.name} onChange={e => edit({name: e.target.value})} />
              </h2>
              <Field label="Desired outcome">
                <textarea value={intent.outcome} onChange={e => edit({outcome: e.target.value})} />
              </Field>
              <div className="compact-fields">
                <Field label="Platform">
                  <input
                    list="platforms"
                    value={intent.platform ?? ''}
                    onChange={e => edit({platform: e.target.value})}
                  />
                </Field>
                <datalist id="platforms">
                  {['macOS', 'iOS', 'iPadOS', 'Android', 'Windows'].map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </datalist>
                <Field label="Ownership">
                  <input
                    value={intent.ownership ?? ''}
                    placeholder="Unresolved"
                    onChange={e => edit({ownership: e.target.value})}
                  />
                </Field>
                <Field label="Functional role">
                  <input
                    value={intent.role ?? ''}
                    placeholder="Unresolved"
                    onChange={e => edit({role: e.target.value})}
                  />
                </Field>
                <Field label="Layer">
                  <select
                    value={intent.layer ?? ''}
                    onChange={e => edit({layer: e.target.value === '' ? null : Number(e.target.value)})}
                  >
                    <option value="">Unresolved</option>
                    {Array.from({length: 8}, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <StringList
                key={intent.id + 'requirements'}
                label="Requirements"
                value={intent.requirements}
                onChange={v => edit({requirements: v})}
              />
              <details>
                <summary>Scope and dependencies</summary>
                {intent.requirements.some(v => typeof v !== 'string') && (
                  <JsonEditor
                    label="Imported requirements"
                    value={intent.requirements}
                    onApply={v => {
                      if (
                        !Array.isArray(v) ||
                        v.some(x => typeof x !== 'string' || !x.trim()) ||
                        new Set(v).size !== v.length
                      )
                        throw new Error('Use unique nonblank text requirements');
                      edit({requirements: v});
                    }}
                  />
                )}
                <StringList
                  key={intent.id + 'cohorts'}
                  label="Cohorts"
                  value={intent.cohort_ids}
                  options={project.profile.cohorts}
                  onChange={v => edit({cohort_ids: v})}
                />
                <StringList
                  key={intent.id + 'scope'}
                  label="Scope blueprints"
                  value={intent.scope_ids}
                  options={project.profile.scope_blueprints}
                  onChange={v => edit({scope_ids: v})}
                />
                <StringList
                  key={intent.id + 'dependencies'}
                  label="Depends on"
                  value={intent.depends_on}
                  options={project.profile.intents.filter(i => i.id !== intent.id)}
                  onChange={v => edit({depends_on: v})}
                />
              </details>
              <h3>Policy mapping</h3>
              <div className="empty">
                <p>
                  {project.mappings.some(m => m.intent_id === intent.id)
                    ? 'Review linked policy fields'
                    : 'No policy linked'}
                </p>
                <p className="muted">Review platform, values and applicability before projection.</p>
                <button className="primary" onClick={() => navigate('Policies')}>
                  Map to policy
                </button>
              </div>
              <button
                className="danger"
                onClick={() => {
                  update(p => ({
                    ...p,
                    profile: {...p.profile, intents: p.profile.intents.filter(i => i.id !== intent.id)},
                    compiled_plan: null,
                  }));
                  setSelected(undefined);
                }}
              >
                Delete intent
              </button>
            </>
          ) : (
            <Empty title="Select an intent">Inspect its outcome, scope and mapping.</Empty>
          )}
        </aside>
      </div>
    </>
  );
}
export function ProfileTools({project, update}: {project: Project; update: (fn: (p: Project) => Project) => void}) {
  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function compile() {
    setBusy(true);
    setError('');
    try {
      const output = await planner<Record<string, unknown>>('compile', {profile: project.profile});
      setResult(output);
      update(p => ({...p, compiled_plan: output}));
      setError('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-tools">
      <button disabled={busy} onClick={() => void compile()}>
        {busy ? 'Compiling intent…' : 'Validate and compile intent'}
      </button>
      <button onClick={() => download(project.profile, 'profile-v2.json')}>Export profile</button>
      <Field label="Convert v1 profile">
        <input
          type="file"
          accept="application/json,.json"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file)
              void file
                .text()
                .then(text => planner<{profile: Profile}>('convert-v1', {profile: JSON.parse(text)}))
                .then(v => update(p => ({...p, profile: v.profile, compiled_plan: null})))
                .catch(e => setError(String(e)));
          }}
        />
      </Field>
      {error && <p role="alert">{error}</p>}
      {result !== undefined && (
        <details open>
          <summary>Planning diagnostics</summary>
          <pre className="result">{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

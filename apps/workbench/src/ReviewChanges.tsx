import {useEffect, useId, useRef, useState, type ReactNode} from 'react';
import type {
  AssuranceApplicabilityContext,
  AssuranceCatalogBundle,
  AssuranceCatalogLoadResult,
  AssuranceSelection,
  AssuranceSnapshotIndex,
} from 'rexp-studio/browser';
import type {EditorController, Project} from './types';
import {AssuranceReview} from './AssuranceReview';
import {RecommendationDetail} from './AssuranceDetail';
import {presetRows} from './assurance-model';
import {Alert, Field} from './ui';
import {download, request} from './api';
import './assurance.css';
import './review-changes.css';

type Props = {
  c: EditorController;
  project?: Project;
  update: (fn: (p: Project) => Project) => void;
  onContinue: () => void;
  onBack: () => void;
};
export function ReviewChanges({c, project, update, onContinue, onBack}: Props) {
  const [bundle, setBundle] = useState<AssuranceCatalogBundle>();
  const [snapshots, setSnapshots] = useState<AssuranceSnapshotIndex>();
  const [snapshot, setSnapshot] = useState('');
  const [context, setContext] = useState<AssuranceApplicabilityContext>({});
  const [choice, setChoice] = useState(() => {
    try {
      const id = project ? sessionStorage.getItem('campusweave:recommendation:' + project.id) : null;
      return id ? 'recommendation:' + id : '';
    } catch {
      return '';
    }
  });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const contextId = useId();
  const [contextOpen, setContextOpen] = useState(false);
  const loadedCatalogKey = useRef<string | undefined>(undefined);
  const [intentId, setIntentId] = useState(() => {
    try {
      return project ? (sessionStorage.getItem('campusweave:intent:' + project.id) ?? '') : '';
    } catch {
      return '';
    }
  });
  const intent = project?.profile.intents.find(row => row.id === intentId) ?? project?.profile.intents[0];
  // Activity reruns effects when this stage becomes visible; unchanged IDs preserve review inputs.
  useEffect(() => {
    if (!project) return;
    try {
      const savedIntent = sessionStorage.getItem('campusweave:intent:' + project.id);
      if (savedIntent && project.profile.intents.some(row => row.id === savedIntent))
        setIntentId(current => (current === savedIntent ? current : savedIntent));
      const savedRecommendation = sessionStorage.getItem('campusweave:recommendation:' + project.id);
      if (
        savedRecommendation &&
        (!bundle || bundle.catalog.recommendations.some(row => row.id === savedRecommendation && row.selectable))
      ) {
        const next = 'recommendation:' + savedRecommendation;
        setChoice(current => (current === next ? current : next));
      }
    } catch {
      /* Session persistence is optional. */
    }
  }, []);

  useEffect(() => {
    const loadKey = JSON.stringify([snapshot, retry]);
    if (loadedCatalogKey.current === loadKey) return;
    loadedCatalogKey.current = undefined;
    let active = true;
    setLoading(true);
    setError('');
    setBundle(undefined);
    void Promise.all([
      request<AssuranceCatalogLoadResult>(
        '/api/assurance/catalog' + (snapshot ? '?snapshotDigest=' + encodeURIComponent(snapshot) : ''),
      ),
      request<AssuranceSnapshotIndex>('/api/assurance/snapshots'),
    ])
      .then(([catalog, index]) => {
        if (!active) return;
        if (catalog.status !== 'available') throw new Error(catalog.error);
        loadedCatalogKey.current = loadKey;
        setBundle(catalog);
        setSnapshots(index);
        setChoice(current =>
          catalog.catalog.recommendations.some(row => row.selectable && current === 'recommendation:' + row.id) ||
          catalog.presets.presets.some(row => current === 'preset:' + row.id)
            ? current
            : '',
        );
      })
      .catch(reason => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [snapshot, retry]);
  const recommendation = bundle?.catalog.recommendations.find(row => choice === 'recommendation:' + row.id);
  const preset = bundle?.presets.presets.find(row => choice === 'preset:' + row.id);
  const selection: AssuranceSelection | undefined = recommendation?.selectable
    ? {kind: 'recommendation', recommendationId: recommendation.id}
    : preset
      ? {kind: 'preset', presetId: preset.id, presetVersion: preset.version}
      : undefined;
  const entries = preset && bundle ? presetRows(preset, bundle.presets.presets) : [];
  const recommendations = recommendation
    ? [recommendation]
    : (bundle?.catalog.recommendations.filter(row => entries.some(entry => entry.recommendationId === row.id)) ?? []);
  const contextKeys = ['osVersion', 'enrollmentChannel', 'deviceOwnership', 'supervision'] as const;
  function contextValues(key: (typeof contextKeys)[number]): string[] {
    return [
      ...new Set(
        recommendations.flatMap(row =>
          row.applicability.predicates
            .filter(
              predicate =>
                predicate.field === key && (predicate.operator === 'equals' || predicate.operator === 'oneOf'),
            )
            .flatMap(predicate => (Array.isArray(predicate.value) ? predicate.value : [predicate.value]).map(String)),
        ),
      ),
    ];
  }
  const missingContext = contextKeys.filter(key => contextValues(key).length > 0 && !context[key]?.trim());
  useEffect(() => {
    if (missingContext.length) setContextOpen(true);
  }, [missingContext.join(',')]);
  const sourceIds = new Set(recommendations.flatMap(row => row.provenance.evidence));
  const sources = bundle?.catalog.sources.filter(row => sourceIds.has(row.sourceId)) ?? [];
  const heading = (
    <>
      <header className="worksheet-heading">
        <h1>Review changes</h1>
        <p>{intent?.name || 'Choose the settings for your policy draft'}</p>
        {selection && (
          <div className="review-badges">
            <span className="badge identifier">
              {recommendation?.mapping?.target ?? preset?.title ?? recommendation?.sourceRecommendationId}
            </span>
            <span className="badge">{recommendation?.disposition ?? 'Relution Policy Studio preset'}</span>
          </div>
        )}
      </header>
      {!c.policy && <TargetPolicySetup c={c} />}
    </>
  );
  const inspector = (acknowledgments?: ReactNode) => (
    <>
      <h2 className="review-inspector-title">Source &amp; scope</h2>
      <section className="review-source-summary">
        {selection ? (
          <>
            <span className="eyebrow">Source</span>
            <h3>{recommendation?.sourceRecommendationId ?? preset?.title}</h3>
            <p>{recommendation?.title ?? preset?.impact}</p>
            <span className="review-freshness">
              Freshness {[...new Set(sources.map(source => source.refresh.freshnessState))].join(' / ') || 'unknown'}
            </span>
            <p className="muted">Numeric values follow the repository mapping.</p>
            <details>
              <summary>Source documents ({sources.length})</summary>
              {sources.map(source => (
                <section key={source.sourceId}>
                  <h3>{source.title}</h3>
                  <p>
                    {source.edition} · last checked {source.lastCheckedAt ?? 'unknown'}
                  </p>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    View source details ↗
                  </a>
                </section>
              ))}
            </details>
          </>
        ) : (
          <p className="muted">Select a recommendation or preset to inspect its source evidence.</p>
        )}
      </section>
      {acknowledgments}
      <details open={!selection}>
        <summary>{selection ? 'Change recommendation' : 'Choose a recommendation or preset'}</summary>
        <Field label="Find a recommendation or preset">
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Title or identifier"
          />
        </Field>
        <Field label="Reviewed selection">
          <select
            value={choice}
            disabled={!bundle || loading}
            onChange={event => {
              setChoice(event.target.value);
              try {
                if (project) {
                  const key = 'campusweave:recommendation:' + project.id;
                  if (event.target.value.startsWith('recommendation:'))
                    sessionStorage.setItem(key, event.target.value.slice(15));
                  else sessionStorage.removeItem(key);
                }
              } catch {
                /* Session persistence is optional. */
              }
            }}
          >
            <option value="">Choose a recommendation or preset</option>
            <optgroup label="Recommendations">
              {bundle?.catalog.recommendations
                .filter(
                  row =>
                    row.selectable &&
                    (!query ||
                      (row.title + ' ' + row.id).toLowerCase().includes(query.toLowerCase()) ||
                      choice === 'recommendation:' + row.id),
                )
                .map(row => (
                  <option key={row.id} value={'recommendation:' + row.id}>
                    {row.title} · {row.platform}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Relution Policy Studio presets">
              {bundle?.presets.presets
                .filter(
                  row =>
                    !query ||
                    (row.title + ' ' + row.id).toLowerCase().includes(query.toLowerCase()) ||
                    choice === 'preset:' + row.id,
                )
                .map(row => (
                  <option key={row.id} value={'preset:' + row.id}>
                    {row.title} · v{row.version}
                  </option>
                ))}
            </optgroup>
          </select>
        </Field>
      </details>
      <details open={!c.policy && c.state.workspace.policies.length > 0}>
        <summary>Source snapshot &amp; target</summary>
        <Field label="Source snapshot">
          <select value={snapshot} onChange={event => setSnapshot(event.target.value)}>
            <option value="">Installed snapshot (currency unverified)</option>
            {snapshots?.entries.map(row => (
              <option key={row.snapshotDigest} value={row.snapshotDigest}>
                Retained · {row.sourceCheckedAt || 'date unknown'} · {row.snapshotDigest.slice(0, 10)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target policy">
          <select
            value={c.selection?.policyIndex ?? ''}
            onChange={event => c.setSelection({policyIndex: Number(event.target.value), versionIndex: 0})}
          >
            <option value="" disabled>
              Select policy
            </option>
            {c.state.workspace.policies.map((row, index) => (
              <option key={row.path} value={index}>
                {String(row.document.name ?? row.path)}
              </option>
            ))}
          </select>
        </Field>
        {Array.isArray(c.policy?.document.versions) && (
          <Field label="Target version">
            <select
              value={c.selection?.versionIndex ?? 0}
              onChange={event =>
                c.selection && c.setSelection({...c.selection, versionIndex: Number(event.target.value)})
              }
            >
              {c.policy.document.versions.map((_, index) => (
                <option key={index} value={index}>
                  Version {index + 1}
                </option>
              ))}
            </select>
          </Field>
        )}
        {bundle && <p className="muted identifier">Snapshot {bundle.snapshotDigest}</p>}
      </details>
      <section className="review-scope-summary">
        <h3>Scope</h3>
        <p>
          {[intent?.role, intent?.ownership, intent?.platform].filter(Boolean).join(' · ') ||
            'Scope has not been specified'}
        </p>
        <p className="muted">{c.policy ? String(c.policy.document.name ?? c.policy.path) : 'No policy selected'}</p>
        <details open={contextOpen} onToggle={event => setContextOpen(event.currentTarget.open)}>
          <summary>
            Review applicability context{missingContext.length > 0 ? ' · ' + missingContext.length + ' required' : ''}
          </summary>
          <p className="muted">
            These are reviewed assumptions, not a live device assessment. Values below come from the selected
            recommendations.
          </p>
          {missingContext.length > 0 && (
            <p role="status">Supply the required context before applying: {missingContext.join(', ')}.</p>
          )}
          {contextKeys.map(key => {
            const values = contextValues(key);
            return (
              <div key={key}>
                <Field
                  label={
                    {
                      osVersion: 'OS version',
                      enrollmentChannel: 'Enrollment channel',
                      deviceOwnership: 'Device ownership',
                      supervision: 'Supervision',
                    }[key]
                  }
                >
                  <input
                    value={context[key] ?? ''}
                    list={contextId + '-' + key}
                    aria-describedby={values.length ? contextId + '-' + key + '-hint' : undefined}
                    onChange={event => setContext(current => ({...current, [key]: event.target.value || undefined}))}
                  />
                  <datalist id={contextId + '-' + key}>
                    {values.map(value => (
                      <option key={value} value={value} />
                    ))}
                  </datalist>
                </Field>
                {values.length > 0 && (
                  <p id={contextId + '-' + key + '-hint'} className="muted review-context-hint">
                    Expected values: {values.join(' · ')}
                  </p>
                )}
              </div>
            );
          })}
        </details>
      </section>
      <details>
        <summary>Project &amp; intent details</summary>
        <dl className="facts review-project-facts">
          <div>
            <dt>Project</dt>
            <dd>{project?.name ?? 'No project open'}</dd>
          </div>
          <div>
            <dt>Institution</dt>
            <dd>{project?.profile.organizations.map(row => row.name || row.id).join(', ') || 'Not specified'}</dd>
          </div>
        </dl>
        {project && project.profile.intents.length > 1 && (
          <Field label="Intent">
            <select
              value={intent?.id ?? ''}
              onChange={event => {
                setIntentId(event.target.value);
                try {
                  sessionStorage.setItem('campusweave:intent:' + project.id, event.target.value);
                } catch {
                  /* Session persistence is optional. */
                }
              }}
            >
              {project.profile.intents.map(row => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {intent && (
          <section className="review-intent-summary">
            <h3>Intent</h3>
            <p>{intent.name}</p>
            <p className="muted">{intent.outcome || 'No outcome recorded'}</p>
          </section>
        )}
      </details>
      {recommendation && bundle && (
        <details>
          <summary>Recommendation evidence &amp; mapping</summary>
          <RecommendationDetail
            recommendation={recommendation}
            sources={sources}
            snapshotDigest={bundle.snapshotDigest}
          />
        </details>
      )}
    </>
  );
  return (
    <div className="review-changes assurance">
      {bundle && selection && !loading ? (
        <AssuranceReview
          key={JSON.stringify(selection) + bundle.snapshotDigest + (project?.id ?? '') + (intent?.id ?? '')}
          c={c}
          project={project}
          update={update}
          bundle={bundle}
          selection={selection}
          snapshot={snapshot}
          context={context}
          worksheet={{heading, inspector, onContinue, onBack}}
        />
      ) : (
        <>
          <div className="worksheet-grid">
            <section className="review-main">
              {heading}
              {loading ? (
                <p role="status">Loading assurance sources and snapshots…</p>
              ) : error ? (
                <Alert>
                  {error}
                  <button onClick={() => setRetry(value => value + 1)}>Retry assurance catalog</button>
                </Alert>
              ) : (
                <div className="review-preview-empty">
                  <h2>Choose what to review</h2>
                  <p>
                    Select a source recommendation or Relution Policy Studio preset. The preview will compare its
                    proposed settings with your current policy draft.
                  </p>
                  {bundle &&
                    !bundle.catalog.recommendations.some(row => row.selectable) &&
                    !bundle.presets.presets.length && (
                      <p>No selectable recommendations or presets are available in this snapshot.</p>
                    )}
                </div>
              )}
              {!project && <Alert>Open a project to preserve review receipts.</Alert>}
              {!c.policy && <Alert>Create or select a policy before generating an exact preview.</Alert>}
            </section>
            <aside className="context-panel review-context" aria-label="Source and scope">
              {inspector()}
            </aside>
          </div>
          <div className="worksheet-footer">
            <span className="muted">
              {c.isDirty ? 'Policy draft has unsaved changes' : 'Choose a selection to preview changes'}
            </span>
            <button onClick={onContinue}>Continue to save &amp; map →</button>
          </div>
        </>
      )}
      {!!project?.assurance_reviews?.length && (
        <details className="review-saved-receipts">
          <summary>Preserved review receipts ({project.assurance_reviews.length})</summary>
          <p>Receipts are preserved with the project. Saving the policy draft is a separate action.</p>
          <button onClick={() => download(project.assurance_reviews, 'campusweave-assurance-reviews.json')}>
            Export review receipts
          </button>
          <button onClick={onContinue}>Continue to save &amp; map →</button>
        </details>
      )}
    </div>
  );
}

function TargetPolicySetup({c}: {c: EditorController}) {
  if (!c.state.workspace.policies.length) return <CreateTargetPolicy c={c} />;
  return (
    <section className="review-select-policy">
      <h2>Select target policy</h2>
      <p className="muted">Choose the existing policy receiving these settings.</p>
      <Field label="Target policy for review">
        <select
          value={c.selection?.policyIndex ?? ''}
          onChange={event => c.setSelection({policyIndex: Number(event.target.value), versionIndex: 0})}
        >
          <option value="" disabled>
            Select policy
          </option>
          {c.state.workspace.policies.map((policy, index) => (
            <option key={policy.path} value={index}>
              {String(policy.document.name ?? policy.path)}
            </option>
          ))}
        </select>
      </Field>
      <details>
        <summary>Create another target policy</summary>
        <CreateTargetPolicy c={c} />
      </details>
    </section>
  );
}
function CreateTargetPolicy({c}: {c: EditorController}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create() {
    setBusy(true);
    setError('');
    try {
      await c.addPolicy();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="review-create-policy">
      <h2>Create target policy</h2>
      <p className="muted">Choose a name and platform for the policy receiving these settings.</p>
      <div className="review-create-fields">
        <Field label="Policy name">
          <input value={c.newPolicyName} onChange={event => c.setNewPolicyName(event.target.value)} />
        </Field>
        <Field label="Policy platform">
          <select value={c.newPolicyPlatform} onChange={event => c.setNewPolicyPlatform(event.target.value)}>
            <option value="">Select platform</option>
            {c.creatablePlatforms.map(platform => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </Field>
        <button
          disabled={busy || c.isDirty || !c.newPolicyName.trim() || !c.newPolicyPlatform}
          onClick={() => void create()}
        >
          {busy ? 'Creating policy…' : 'Create target policy'}
        </button>
      </div>
      {c.isDirty && <p role="status">Save the current workspace draft before creating a policy.</p>}
      {error && <Alert>{error}</Alert>}
    </section>
  );
}

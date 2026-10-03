import {useMemo, useRef, useState, type ReactNode} from 'react';
import type {
  AssuranceCatalogBundle,
  AssuranceConflictDecision,
  AssuranceParameter,
  AssuranceSelection,
  AssuranceSelectionPreview,
  AssuranceSelectionRequest,
  AssuranceApplicabilityContext,
  AssuranceReviewReceipt,
} from 'rexp-studio/browser';
import type {EditorController, Project} from './types';
import {Alert, Field, Icon, JsonView} from './ui';
import {download, request} from './api';
import {presetRows, textValue} from './assurance-model';
import {AssuranceExclusions} from './AssuranceExclusions';
export interface AssuranceReviewProps {
  c: EditorController;
  project?: Project;
  update: (fn: (p: Project) => Project) => void;
  bundle: AssuranceCatalogBundle;
  selection: AssuranceSelection;
  snapshot: string;
  context: AssuranceApplicabilityContext;
  worksheet?: {
    heading: ReactNode;
    inspector: (acknowledgments: ReactNode) => ReactNode;
    onContinue: () => void;
    onBack: () => void;
  };
}
export function AssuranceReview({
  c,
  project,
  update,
  bundle,
  selection,
  snapshot,
  context,
  worksheet,
}: AssuranceReviewProps) {
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [decisions, setDecisions] = useState<AssuranceConflictDecision[]>([]);
  const [excluded, setExcluded] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [readiness, setReadiness] = useState('');
  const [readinessChecked, setReadinessChecked] = useState(false);
  const [obligations, setObligations] = useState('');
  const [exceptions, setExceptions] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{
    value: AssuranceSelectionPreview;
    input: AssuranceSelectionRequest;
    formKey: string;
  }>();
  const [receipt, setReceipt] = useState<AssuranceReviewReceipt>();
  const [appliedPreview, setAppliedPreview] = useState<AssuranceSelectionPreview>();
  const preset =
    selection.kind === 'preset' ? bundle.presets.presets.find(p => p.id === selection.presetId) : undefined;
  const entries = preset ? presetRows(preset, bundle.presets.presets) : [];
  const selectedIds = new Set(
    selection.kind === 'recommendation' ? [selection.recommendationId] : entries.map(e => e.recommendationId),
  );
  const recommendations = bundle.catalog.recommendations.filter(r => selectedIds.has(r.id));
  const sourceIds = new Set(recommendations.flatMap(r => r.provenance.evidence));
  const sources = bundle.catalog.sources.filter(s => sourceIds.has(s.sourceId));
  const params = [...new Map(recommendations.flatMap(r => r.parameters).map(p => [p.id, p])).values()];
  const formKey = JSON.stringify({
    selection,
    context,
    snapshot,
    parameters,
    decisions,
    excluded,
    acknowledged,
    readiness,
    readinessChecked,
    obligations,
    exceptions,
    projectId: project?.id,
    policy: c.policy?.path,
    version: c.selection?.versionIndex,
  });
  const live = useRef({formKey, workspace: c.state.workspace, revision: c.state.revision});
  live.current = {formKey, workspace: c.state.workspace, revision: c.state.revision};
  const stale =
    !!preview &&
    (preview.formKey !== formKey ||
      preview.input.workspace !== c.state.workspace ||
      preview.input.expectedRevision !== c.state.revision);
  const requestBody = useMemo<AssuranceSelectionRequest | undefined>(
    () =>
      c.policy && c.selection
        ? {
            expectedRevision: c.state.revision,
            workspace: c.state.workspace,
            target: {policyPath: c.policy.path, versionIndex: c.selection.versionIndex},
            selection,
            applicability: context,
            parameters,
            decisions,
            exclusions: Object.entries(excluded).map(([recommendationId, reason]) => ({recommendationId, reason})),
            acknowledgedSourceDigests: acknowledged,
            obligations: obligations
              .split('\n')
              .map(v => v.trim())
              .filter(Boolean),
            exceptions: exceptions
              .split('\n')
              .map(v => v.trim())
              .filter(Boolean),
            ...(snapshot ? {snapshotDigest: snapshot} : {}),
            ...(readinessChecked && readiness.trim()
              ? {readinessReview: {reviewed: true, rationale: readiness.trim()}}
              : {}),
          }
        : undefined,
    [formKey, c.state.workspace, c.state.revision],
  );
  async function makePreview() {
    if (!requestBody) return;
    const input = requestBody;
    const key = formKey;
    setBusy('preview');
    setError('');
    try {
      const value = await request<AssuranceSelectionPreview>('/api/assurance/preview', input);
      if (
        live.current.formKey !== key ||
        live.current.workspace !== input.workspace ||
        live.current.revision !== input.expectedRevision
      ) {
        setError('The selection or draft changed during preview. Generate a new preview.');
        return;
      }
      setPreview({value, input, formKey: key});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy('');
    }
  }
  async function apply() {
    if (!preview || stale || !preview.value.ready || !project) return;
    setBusy('apply');
    setError('');
    const p = preview.value;
    const projectId = project.id;
    try {
      const response = await c.applyAssuranceSelection({
        ...preview.input,
        draftDigest: p.draftDigest,
        resultDigest: p.resultDigest,
        previewDigest: p.previewDigest,
        assuranceDigest: p.assuranceDigest,
        resolvedSnapshotDigest: p.snapshotDigest,
        snapshotSelection: p.snapshotSelection,
        sourceDigests: p.sourceDigests,
        ...(p.presetDigest ? {presetDigest: p.presetDigest} : {}),
      });
      if (!response) {
        setError('The reviewed draft could not be applied. Check workspace status and create a fresh preview.');
        return;
      }
      setReceipt(response.receipt);
      setAppliedPreview(p);
      update(current =>
        current.id === projectId
          ? {...current, assurance_reviews: [...(current.assurance_reviews ?? []), response.receipt]}
          : current,
      );
      setPreview(undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy('');
    }
  }
  function decision(path: string, field: 'winnerRecommendationId' | 'rationale', value: string) {
    setDecisions(rows => {
      const existing = rows.find(r => r.path === path) ?? {path, winnerRecommendationId: '', rationale: ''};
      return [...rows.filter(r => r.path !== path), {...existing, [field]: value}];
    });
  }
  const inputs = (
    <>
      {' '}
      {preset && (
        <>
          <p>{preset.impact ?? 'Review operational impact before adoption.'}</p>
          <ul>
            {preset.prerequisites.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}
      {params.length > 0 && (
        <fieldset>
          <legend>Organization parameters</legend>
          {params.map(p => (
            <Parameter
              key={p.id}
              parameter={p}
              value={parameters[p.id]}
              presetDefault={entries.find(e => Object.hasOwn(e.parameterDefaults, p.id))?.parameterDefaults[p.id]}
              onChange={value =>
                setParameters(current => {
                  const next = {...current};
                  if (value === undefined) delete next[p.id];
                  else next[p.id] = value;
                  return next;
                })
              }
            />
          ))}
        </fieldset>
      )}
      {preset?.requiresReadinessReview && (
        <fieldset>
          <legend>High assurance readiness</legend>
          <p>Record readiness for the prerequisites and potentially disruptive settings.</p>
          <Field label="Readiness rationale">
            <textarea value={readiness} onChange={e => setReadiness(e.target.value)} />
          </Field>
          <label className="checkbox">
            <input type="checkbox" checked={readinessChecked} onChange={e => setReadinessChecked(e.target.checked)} />I
            reviewed readiness and operational impact.
          </label>
        </fieldset>
      )}
      <details>
        <summary>Selection exclusions and follow-up obligations</summary>
        {recommendations.map(r => (
          <div className="assurance-exclusion" key={r.id}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={Object.hasOwn(excluded, r.id)}
                onChange={e =>
                  setExcluded(values => {
                    const next = {...values};
                    if (e.target.checked) next[r.id] = '';
                    else delete next[r.id];
                    return next;
                  })
                }
              />
              Exclude {r.title}
            </label>
            {Object.hasOwn(excluded, r.id) && (
              <Field label={'Reason for excluding ' + r.title}>
                <input
                  value={excluded[r.id]}
                  onChange={e => setExcluded(values => ({...values, [r.id]: e.target.value}))}
                />
              </Field>
            )}
          </div>
        ))}
        <Field label="Organizational obligations (one per line)">
          <textarea value={obligations} onChange={e => setObligations(e.target.value)} />
        </Field>
        <Field label="Documented exceptions (one per line)">
          <textarea value={exceptions} onChange={e => setExceptions(e.target.value)} />
        </Field>
      </details>
    </>
  );
  const acknowledgments = (
    <fieldset className="review-acknowledgments">
      <legend>Source snapshots reviewed</legend>
      <p className="muted">Acknowledgment does not establish freshness.</p>
      {sources.map(source => (
        <div key={source.sourceId}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={acknowledged.includes(source.digest)}
              onChange={event =>
                setAcknowledged(values =>
                  event.target.checked ? [...values, source.digest] : values.filter(value => value !== source.digest),
                )
              }
            />
            <span>{source.title}</span>
          </label>
          <details>
            <summary>Snapshot dates &amp; digest</summary>
            <p>
              {snapshot ? 'Retained snapshot' : 'Installed snapshot'} · {source.edition}
            </p>
            <p>
              Published {source.publicationDate ?? 'unknown'} · retrieved {source.retrievedAt ?? 'unknown'} ·{' '}
              {source.refresh.freshnessState}
            </p>
            <p className="identifier">{source.digest}</p>
          </details>
        </div>
      ))}
    </fieldset>
  );
  const displayedPreview = preview?.value ?? appliedPreview;
  const exactPreview = (
    <>
      {displayedPreview && (
        <>
          <h2 className={worksheet ? 'sr-only' : undefined}>
            {preview ? 'Exact change preview' : 'Last applied changes'}
          </h2>
          {stale && (
            <Alert>
              This preview is stale because the selection, review inputs, target, or draft changed. Generate a new
              preview before applying.
            </Alert>
          )}
          <Preview value={displayedPreview} worksheet={!!worksheet} templates={c.templatesByType} />
          {preview?.value.conflicts.map(conflict => (
            <fieldset key={conflict.path}>
              <legend>Conflict: {conflict.path}</legend>
              <Field label={'Winning recommendation for ' + conflict.path}>
                <select
                  value={decisions.find(d => d.path === conflict.path)?.winnerRecommendationId ?? ''}
                  onChange={e => decision(conflict.path, 'winnerRecommendationId', e.target.value)}
                >
                  <option value="">Choose deliberately</option>
                  {conflict.recommendationIds.map((id, i) => (
                    <option key={id} value={id}>
                      {recommendations.find(r => r.id === id)?.title ?? id}: {textValue(conflict.values[i])}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={'Decision rationale for ' + conflict.path}>
                <textarea
                  value={decisions.find(d => d.path === conflict.path)?.rationale ?? ''}
                  onChange={e => decision(conflict.path, 'rationale', e.target.value)}
                />
              </Field>
            </fieldset>
          ))}
        </>
      )}
    </>
  );
  const receiptNotice = (
    <>
      {' '}
      {receipt && (
        <Alert>
          <div>
            Reviewed selection applied to the unsaved policy draft. The receipt is included in project autosave; save
            the policy separately.
            <div className="inline-actions">
              <button onClick={() => download(receipt, 'campusweave-assurance-review.json')}>
                Export review receipt
              </button>
              <button onClick={() => download(c.state.workspace, 'campusweave-policy-draft.json')}>
                Export unsaved policy draft
              </button>
            </div>
          </div>
        </Alert>
      )}
    </>
  );
  const targetNotice = (
    <>
      <p className="muted">
        Preview targets {c.policy ? String(c.policy.document.name ?? c.policy.path) : 'no selected policy'}, version{' '}
        {(c.selection?.versionIndex ?? 0) + 1}. Apply changes the local draft. Save remains a separate action.
      </p>
      {!project && <Alert>Open a project to preserve review receipts before applying.</Alert>}
      {!c.policy && <Alert>Select a target policy before generating a preview.</Alert>}
    </>
  );
  const actions = (
    <>
      {error && <Alert>{error}</Alert>}
      {preview && !preview.value.ready && (
        <p role="status">
          Resolve missing parameters, source acknowledgments, conflicts, exclusions, or readiness review, then refresh
          the preview.
        </p>
      )}
      <div className={worksheet ? 'worksheet-footer review-actions' : 'inline-actions'}>
        {worksheet && (
          <button onClick={worksheet.onBack}>
            <Icon name="back" />
            Back
          </button>
        )}
        <span className="muted">{c.isDirty ? 'Changes are not saved yet' : 'Preview before changing the draft'}</span>
        <button disabled={!requestBody || !!busy} onClick={() => void makePreview()}>
          {busy === 'preview' ? 'Preparing preview…' : preview ? 'Refresh preview' : 'Preview exact changes'}
        </button>
        <button
          className="primary"
          disabled={!project || !preview || stale || !preview.value.ready || !!busy}
          onClick={() => void apply()}
        >
          {busy === 'apply'
            ? 'Applying to draft…'
            : worksheet
              ? 'Apply to draft →'
              : 'Apply reviewed selection to draft'}
        </button>
        {worksheet && receipt && (
          <button className="primary" disabled={!!busy} onClick={worksheet.onContinue}>
            Continue to save &amp; map →
          </button>
        )}
      </div>
    </>
  );
  if (worksheet)
    return (
      <section className="assurance-review review-worksheet">
        <div className="worksheet-grid">
          <div className="review-main">
            {worksheet.heading}
            {displayedPreview ? (
              exactPreview
            ) : (
              <div className="review-preview-empty">
                <h2>Prepare an exact comparison</h2>
                <p>
                  Select a recommendation or preset, review its source and scope, then preview the current and proposed
                  settings.
                </p>
              </div>
            )}
            <details
              className="review-inputs"
              open={!displayedPreview && (params.length > 0 || !!preset?.requiresReadinessReview)}
            >
              <summary>Parameters, exclusions &amp; obligations</summary>
              {inputs}
            </details>
            {targetNotice}
            {receiptNotice}
          </div>
          <aside className="context-panel review-context" aria-label="Source and scope">
            {worksheet.inspector(acknowledgments)}
          </aside>
        </div>
        {actions}
      </section>
    );
  return (
    <section className="assurance-review">
      <h3>Prepare reviewed selection</h3>
      {targetNotice}
      {inputs}
      {acknowledgments}
      {exactPreview}
      {actions}
      {receiptNotice}
    </section>
  );
}

function Parameter({
  parameter: p,
  value,
  presetDefault,
  onChange,
}: {
  parameter: AssuranceParameter;
  value: unknown;
  presetDefault: unknown;
  onChange: (value: unknown) => void;
}) {
  const fallback = presetDefault ?? p.defaultValue;
  const options = p.valueType === 'boolean' ? [true, false] : p.allowedValues;
  return (
    <div>
      <Field label={p.label + (p.required ? ' (required)' : '')}>
        {options ? (
          <select
            value={value === undefined ? '' : JSON.stringify(value)}
            onChange={e => onChange(e.target.value === '' ? undefined : JSON.parse(e.target.value))}
          >
            <option value="">
              {fallback === undefined ? 'Select a value' : 'Use default: ' + textValue(fallback)}
            </option>
            {options.map((option, i) => (
              <option key={i} value={JSON.stringify(option)}>
                {textValue(option)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={p.valueType === 'integer' || p.valueType === 'number' ? 'number' : 'text'}
            min={p.minimum}
            max={p.maximum}
            step={p.valueType === 'integer' ? 1 : 'any'}
            value={value === undefined ? '' : String(value)}
            placeholder={fallback === undefined ? 'No default' : String(fallback)}
            onChange={e =>
              onChange(
                e.target.value === ''
                  ? undefined
                  : p.valueType === 'integer' || p.valueType === 'number'
                    ? Number(e.target.value)
                    : e.target.value,
              )
            }
          />
        )}
      </Field>
      <p className="muted identifier">
        {p.path} · default {textValue(fallback)}
      </p>
    </div>
  );
}
function Preview({
  value: p,
  worksheet,
  templates,
}: {
  value: AssuranceSelectionPreview;
  worksheet: boolean;
  templates: EditorController['templatesByType'];
}) {
  const metadataPaths = new Set([
    '/createdBy',
    '/creationDate',
    '/details/type',
    '/details/uuid',
    '/modificationDate',
    '/modifiedBy',
    '/uuid',
  ]);
  const metadata = worksheet
    ? p.changes.filter(change => metadataPaths.has(change.path.replace(/^\/configurations\/\d+/, '')))
    : [];
  const settings = worksheet
    ? p.changes.filter(change => !metadataPaths.has(change.path.replace(/^\/configurations\/\d+/, '')))
    : p.changes;
  const Extra = worksheet ? 'details' : 'div';

  return (
    <>
      <div className="review-badges">
        <span className="badge">
          {worksheet ? settings.length + ' settings · ' + metadata.length + ' metadata' : p.changes.length + ' changes'}
        </span>
        <span className="badge">{p.retained.length} retained</span>
        <span className="badge">{p.exclusions.length} exclusions</span>
        <span className="badge">
          {p.conflicts.filter(c => !c.resolvedBy).length === 0
            ? 'No unresolved conflicts'
            : p.conflicts.filter(c => !c.resolvedBy).length + ' unresolved conflicts'}
        </span>
      </div>
      <ChangeTable rows={settings} templates={templates} caption="Changed settings" />
      <Extra className="preview-details">
        {worksheet && <summary>Preview details, metadata and evidence</summary>}
        {metadata.length > 0 && (
          <details>
            <summary>Configuration metadata ({metadata.length})</summary>
            <ChangeTable rows={metadata} templates={templates} caption="Exact configuration metadata changes" />
          </details>
        )}
        {!p.changes.length && <p className="muted">No changed values in this preview.</p>}
        <details>
          <summary>Retained settings ({p.retained.length})</summary>
          {p.retained.map((c, i) => (
            <p key={i}>
              <code>
                {c.target}
                {c.path}
              </code>
              : {textValue(c.value)} · {c.reason}
            </p>
          ))}
        </details>
        <AssuranceExclusions entries={p.exclusions} />
        {p.unresolvedApplicability?.length > 0 && (
          <Alert>
            <ul>
              {p.unresolvedApplicability.map(e => (
                <li key={e.recommendationId}>{e.reason}</li>
              ))}
            </ul>
          </Alert>
        )}
        {p.unresolvedParameters.length > 0 && <Alert>Missing parameters: {p.unresolvedParameters.join(', ')}</Alert>}
        {p.unacknowledgedSourceDigests.length > 0 && (
          <Alert>{p.unacknowledgedSourceDigests.length} source snapshots still require acknowledgment.</Alert>
        )}
        <details>
          <summary>
            Organizational obligations ({p.obligations.length}) and exceptions ({p.exceptions.length})
          </summary>
          <p>These obligations remain unfulfilled until separately evidenced.</p>
          <ul>
            {p.obligations.slice(0, 30).map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
          {p.obligations.length > 30 && <p>Export the preview for all obligations.</p>}
          <ul>
            {p.exceptions.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </details>
        <button onClick={() => download(p, 'campusweave-assurance-preview.json')}>Export exact preview</button>
        <details>
          <summary>Exact preview evidence</summary>
          <JsonView value={p} />
        </details>
      </Extra>
    </>
  );
}

function ChangeTable({
  rows,
  templates,
  caption,
}: {
  rows: AssuranceSelectionPreview['changes'];
  templates: EditorController['templatesByType'];
  caption: string;
}) {
  function label(change: AssuranceSelectionPreview['changes'][number]) {
    const normalize = (path: string) =>
      path
        .replace(/^\/configurations\/\d+/, '')
        .replace(/^\/?details[/.]/, '')
        .replace(/^\//, '')
        .replaceAll('/', '.');
    const field = templates
      .get(change.target)
      ?.fields.find(candidate => normalize(candidate.path) === normalize(change.path));
    return (
      field?.label ??
      (change.path.split(/[/.]/).at(-1) || change.target)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    );
  }
  return (
    <div className="assurance-table-scroll">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Setting</th>
            <th>Current</th>
            <th>Proposed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((change, index) => (
            <tr key={index}>
              <td>
                <span className="review-setting-name">{label(change)}</span>
                <small className="identifier">{change.path}</small>
              </td>
              <td>{textValue(change.before)}</td>
              <td>{textValue(change.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

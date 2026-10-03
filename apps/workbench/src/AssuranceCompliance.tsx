import {useRef, useState} from 'react';
import type {AssuranceCatalogBundle, AssuranceApplicabilityContext} from 'rexp-studio/browser';
import type {EditorController, Project} from './types';
import {Alert, Empty, Field, JsonView} from './ui';
import {RecommendationDetail, ValueTable} from './AssuranceDetail';
import {AssuranceReview} from './AssuranceReview';
export function AssuranceCompliance({
  c,
  project,
  update,
  bundle,
  snapshot,
  context,
}: {
  c: EditorController;
  project?: Project;
  update: (fn: (p: Project) => Project) => void;
  bundle: AssuranceCatalogBundle;
  snapshot: string;
  context: AssuranceApplicabilityContext;
}) {
  const [checkedScope, setCheckedScope] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const currentScope = JSON.stringify({
    context,
    revision: c.state.revision,
    policy: c.policy?.path,
    version: c.selection?.versionIndex,
    sources: c.complianceSources,
    snapshot,
  });
  const report =
    checkedScope === currentScope && !c.isDirty && !c.complianceLoading && !c.complianceError
      ? c.complianceReport
      : undefined;
  const result = report?.results.find(r => r.id === selected);
  const recommendation = result
    ? bundle.catalog.recommendations.find(
        r => r.sourceFamily === result.source && r.sourceRecommendationId === result.recommendationId,
      )
    : undefined;
  const rows =
    report?.results.filter(
      r =>
        (!status || r.status === status) &&
        (!query || (r.recommendation.title + ' ' + r.recommendationId).toLowerCase().includes(query.toLowerCase())),
    ) ?? [];
  return (
    <div className={'assurance-layout ' + (detailOpen ? 'detail-open' : '')}>
      <section className="assurance-list">
        <div className="assurance-pane-heading">
          <h2>Compliance review</h2>
          <p>
            Local policy checks compare configuration values with source mappings. A passing check does not establish
            device enforcement or organizational compliance.
          </p>
          <p className="muted">Checks use the installed source catalogs.</p>
          {snapshot && (
            <Alert>
              Switch to installed snapshot to run a local compliance check. Retained snapshots remain available for
              recommendation and preset review.
            </Alert>
          )}
          <div className="inline-actions">
            {(['bsi', 'cis', 'vendor'] as const).map(s => (
              <label className="checkbox" key={s}>
                <input
                  type="checkbox"
                  checked={c.complianceSources.includes(s)}
                  onChange={() => c.toggleComplianceSource(s)}
                />
                {s.toUpperCase()}
              </label>
            ))}
          </div>
          <button
            className="primary"
            disabled={!!snapshot || c.isDirty || c.complianceLoading || !c.selection || !c.complianceSources.length}
            onClick={() => {
              setCheckedScope(currentScope);
              void c.refreshCompliance(context);
            }}
          >
            {c.complianceLoading ? 'Checking…' : 'Check compliance'}
          </button>
          {c.complianceError && <Alert>{c.complianceError}</Alert>}
          {c.isDirty && (
            <Alert>
              Save the policy before checking compliance. Checks evaluate the saved workspace; previous results are
              hidden while the draft is unsaved.
            </Alert>
          )}
          {c.complianceReport && !report && !c.isDirty && (
            <Alert>
              Previous results belong to another policy, source selection, or applicability context. Run a fresh check.
            </Alert>
          )}
          {report?.warnings?.map(w => (
            <Alert key={w}>{w}</Alert>
          ))}
        </div>
        <div className="assurance-filters">
          <Field label="Search compliance results">
            <input value={query} onChange={e => setQuery(e.target.value)} />
          </Field>
          <Field label="Compliance status">
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All results</option>
              {['compliant', 'exact-gap', 'choice-required', 'parameter-required', 'not-checkable'].map(v => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        {report ? (
          <>
            <p className="assurance-count" role="status">
              {rows.length} results · {report.policyName} · {report.policyPlatform}
            </p>
            <div className="assurance-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Recommendation</th>
                    <th>Source</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className={r.id === selected ? 'selected' : ''}>
                      <td>
                        <button
                          className="row-button"
                          onClick={e => {
                            trigger.current = e.currentTarget;
                            setSelected(r.id);
                            setDetailOpen(true);
                            requestAnimationFrame(() => heading.current?.focus());
                          }}
                        >
                          {r.recommendation.title}
                        </button>
                        <small>{r.recommendationId}</small>
                      </td>
                      <td>{r.source.toUpperCase()}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <Empty title="No matching compliance results" />}
          </>
        ) : (
          <Empty title="No compliance report">
            <p>Select a policy and run a local check.</p>
          </Empty>
        )}
      </section>
      <aside className="assurance-inspector" aria-label="Compliance inspector">
        <button
          className="assurance-back"
          onClick={() => {
            setDetailOpen(false);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        >
          ← Back to compliance results
        </button>
        {result ? (
          <>
            <h2 ref={heading} tabIndex={-1}>
              {result.recommendation.title}
            </h2>
            <p>{result.status}</p>
            <p>
              Local configuration: {result.localConfigurationStatus ?? result.status}
              <br />
              Applicability: {result.applicabilityStatus ?? 'not separately verified'}
            </p>
            {result.blockingReasons.length > 0 && (
              <Alert>
                <ul>
                  {result.blockingReasons.map(r => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <h3>Configuration evidence</h3>
            {result.mappingResults.map((mapping, i) => (
              <section key={i}>
                <h4>{mapping.target}</h4>
                <p>
                  {mapping.status} · {mapping.kind}
                </p>
                <ValueTable value={mapping.expectedValues} />
                <p>Matching configurations: {mapping.matchingConfigurations.map(c => c.label).join(', ') || 'None'}</p>
                <p>
                  Candidate configurations: {mapping.candidateConfigurations.map(c => c.label).join(', ') || 'None'}
                </p>
              </section>
            ))}
            {recommendation ? (
              <>
                <RecommendationDetail
                  recommendation={recommendation}
                  source={bundle.catalog.sources.find(s => s.sourceId === recommendation.sourceId)}
                  sources={bundle.catalog.sources.filter(s => recommendation.provenance.evidence.includes(s.sourceId))}
                  snapshotDigest={bundle.snapshotDigest}
                />
                {recommendation.selectable && (
                  <AssuranceReview
                    key={recommendation.id}
                    c={c}
                    project={project}
                    update={update}
                    bundle={bundle}
                    selection={{kind: 'recommendation', recommendationId: recommendation.id}}
                    snapshot={snapshot}
                    context={context}
                  />
                )}
              </>
            ) : (
              <Alert>
                No selectable normalized assurance mapping matches this result in the chosen snapshot. Review the source
                evidence and resolve the gap manually.
              </Alert>
            )}
            <details>
              <summary>Complete compliance evidence</summary>
              <JsonView value={result} />
            </details>
          </>
        ) : (
          <Empty title="Select a compliance result">
            <p>Inspect expected values, matched configurations, and blocking reasons.</p>
          </Empty>
        )}
      </aside>
    </div>
  );
}

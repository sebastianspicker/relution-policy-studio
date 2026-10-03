import {useMemo, useRef, useState} from 'react';
import type {AssuranceCatalogBundle, AssuranceSelection, AssuranceApplicabilityContext} from 'rexp-studio/browser';
import type {EditorController, Project} from './types';
import {Empty, Field} from './ui';
import {RecommendationDetail, ValueTable} from './AssuranceDetail';
import {AssuranceReview} from './AssuranceReview';
import {AssuranceExclusions} from './AssuranceExclusions';
import {applicability, presetRows, textValue} from './assurance-model';
interface Props {
  tab: string;
  c: EditorController;
  project?: Project;
  update: (fn: (p: Project) => Project) => void;
  bundle: AssuranceCatalogBundle;
  snapshot: string;
  context: AssuranceApplicabilityContext;
}
export function AssuranceCatalog({tab, c, project, update, bundle, snapshot, context}: Props) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [platform, setPlatform] = useState('');
  const [presetFilter, setPresetFilter] = useState('');
  const [applicable, setApplicable] = useState('');
  const [readiness, setReadiness] = useState('');
  const [currency, setCurrency] = useState('');
  const [selected, setSelected] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [page, setPage] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const tableHeading = useRef<HTMLHeadingElement | null>(null);
  const presets = bundle.presets.presets;
  const isBaseline = tab === 'Baselines';
  const recommendation = bundle.catalog.recommendations.find(r => r.id === selected);
  const preset = presets.find(p => p.id === selected);
  const selection: AssuranceSelection | undefined =
    isBaseline && preset
      ? {kind: 'preset', presetId: preset.id, presetVersion: preset.version}
      : !isBaseline && recommendation
        ? {kind: 'recommendation', recommendationId: recommendation.id}
        : undefined;
  const filterIds = useMemo(() => {
    const p = presets.find(p => p.id === presetFilter);
    return p ? new Set(presetRows(p, presets).map(r => r.recommendationId)) : undefined;
  }, [presets, presetFilter]);
  const filtered = useMemo(
    () =>
      bundle.catalog.recommendations.filter(
        r =>
          (!query || (r.title + ' ' + r.id + ' ' + r.mapping?.target).toLowerCase().includes(query.toLowerCase())) &&
          (!source || r.sourceId === source || r.provenance.evidence.includes(source)) &&
          (!platform || r.platform === platform) &&
          (!filterIds || filterIds.has(r.id)) &&
          (!applicable || applicability(r, String(c.policy?.document.platform ?? ''), context) === applicable) &&
          (!readiness || r.disposition === readiness) &&
          (!currency || r.refresh.freshnessState === currency),
      ),
    [
      bundle.catalog.recommendations,
      query,
      source,
      platform,
      filterIds,
      applicable,
      readiness,
      currency,
      c.policy?.document.platform,
      context,
    ],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 40));
  const currentPage = Math.min(page, pages - 1);
  const rows = filtered.slice(currentPage * 40, (currentPage + 1) * 40);
  function choose(id: string, button: HTMLButtonElement) {
    trigger.current = button;
    setSelected(id);
    setDetailOpen(true);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function back() {
    setDetailOpen(false);
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      else tableHeading.current?.focus();
    });
  }
  function reset() {
    setQuery('');
    setSource('');
    setPlatform('');
    setPresetFilter('');
    setApplicable('');
    setReadiness('');
    setCurrency('');
    setPage(0);
  }
  const presetEntries = preset ? presetRows(preset, presets) : [];
  const parent = preset ? presets.find(p => p.id === preset.inherits) : undefined;
  const inheritedIds = new Set(parent ? presetRows(parent, presets).map(r => r.recommendationId) : []);
  return (
    <div className={'assurance-layout ' + (detailOpen ? 'detail-open' : '')}>
      <section className="assurance-list">
        <div className="assurance-pane-heading">
          <h2 ref={tableHeading} tabIndex={-1}>
            {isBaseline ? 'Baseline presets' : 'Recommendations'}
          </h2>
          <p>
            {isBaseline
              ? 'Essential, Managed, and High assurance are Relution Policy Studio presets. They are not official BSI or CIS assurance levels.'
              : 'Review source requirements, mapping evidence, applicability, and source currency before selecting settings.'}
          </p>
        </div>
        {!isBaseline && (
          <div className="assurance-filters">
            <Field label="Search recommendations">
              <input
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Title, identifier, or target"
              />
            </Field>
            <Filter
              label="Source"
              value={source}
              onChange={setSource}
              values={bundle.catalog.sources.map(s => ({value: s.sourceId, label: s.title}))}
            />
            <Filter
              label="Platform"
              value={platform}
              onChange={setPlatform}
              values={[...new Set(bundle.catalog.recommendations.map(r => r.platform))]}
            />
            <Filter
              label="Relution Policy Studio preset"
              value={presetFilter}
              onChange={setPresetFilter}
              values={presets.map(p => ({value: p.id, label: p.title}))}
            />
            <Filter
              label="Applicability"
              value={applicable}
              onChange={setApplicable}
              values={['Matches context', 'Excluded by context', 'Context required', 'Preview required']}
            />
            <Filter
              label="Implementation readiness"
              value={readiness}
              onChange={setReadiness}
              values={['supported', 'parameter', 'candidate', 'organizational', 'unsupported']}
            />
            <Filter label="Source currency" value={currency} onChange={setCurrency} values={['outdated', 'unknown']} />
            <button onClick={reset}>Reset filters</button>
          </div>
        )}
        <div className="assurance-table-scroll">
          <table>
            <thead>
              {isBaseline ? (
                <tr>
                  <th>Relution Policy Studio preset</th>
                  <th>Inheritance</th>
                  <th>Review</th>
                </tr>
              ) : (
                <tr>
                  <th>Recommendation</th>
                  <th>Platform / source</th>
                  <th>Readiness / currency</th>
                </tr>
              )}
            </thead>
            <tbody>
              {isBaseline
                ? presets.map(p => (
                    <tr key={p.id} className={p.id === selected ? 'selected' : ''}>
                      <td>
                        <button
                          className="row-button"
                          aria-pressed={p.id === selected}
                          onClick={e => choose(p.id, e.currentTarget)}
                        >
                          {p.title}
                        </button>
                        <small>Version {p.version}</small>
                      </td>
                      <td>
                        {presets.find(parent => parent.id === p.inherits)?.title ?? 'Starting preset'}
                        <small>{presetRows(p, presets).length} selected recommendations</small>
                      </td>
                      <td>{p.requiresReadinessReview ? 'Readiness review required' : 'Review exact changes'}</td>
                    </tr>
                  ))
                : rows.map(r => (
                    <tr key={r.id} className={r.id === selected ? 'selected' : ''}>
                      <td>
                        <button
                          className="row-button"
                          aria-pressed={r.id === selected}
                          onClick={e => choose(r.id, e.currentTarget)}
                        >
                          {r.title}
                        </button>
                        <small className="identifier">{r.sourceRecommendationId}</small>
                      </td>
                      <td>
                        {r.platform}
                        <small>{r.sourceFamily.toUpperCase()}</small>
                      </td>
                      <td>
                        {r.disposition}
                        <small>{r.refresh.freshnessState}</small>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!isBaseline && (
          <>
            <p className="assurance-count" role="status">
              {filtered.length} recommendations · page {currentPage + 1} of {pages}
            </p>
            {filtered.length === 0 ? (
              <Empty title="No matching recommendations">
                <p>Adjust the filters to review the available source records.</p>
                <button onClick={reset}>Reset filters</button>
              </Empty>
            ) : (
              <div className="assurance-pagination">
                <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  Previous page
                </button>
                <button disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>
                  Next page
                </button>
              </div>
            )}
          </>
        )}
        {isBaseline && presets.length === 0 && <Empty title="No presets in this snapshot" />}
      </section>
      <aside
        className="assurance-inspector"
        aria-label={isBaseline ? 'Baseline inspector' : 'Recommendation inspector'}
      >
        <button className="assurance-back" onClick={back}>
          ← Back to {isBaseline ? 'presets' : 'recommendations'}
        </button>
        {selection ? (
          <>
            <h2 ref={heading} tabIndex={-1}>
              {isBaseline ? preset?.title : recommendation?.title}
            </h2>
            {!isBaseline && recommendation ? (
              <RecommendationDetail
                recommendation={recommendation}
                source={bundle.catalog.sources.find(s => s.sourceId === recommendation.sourceId)}
                sources={bundle.catalog.sources.filter(s => recommendation.provenance.evidence.includes(s.sourceId))}
                snapshotDigest={bundle.snapshotDigest}
              />
            ) : (
              preset && (
                <>
                  <p>Relution Policy Studio preset · version {preset.version}</p>
                  <p>{preset.impact}</p>
                  <h3>Inheritance and changed settings</h3>
                  <p>
                    {parent ? 'Inherits ' + parent.title + '.' : 'Starting preset; no inherited settings.'} Exact draft
                    differences are shown in the preview.
                  </p>
                  {presetEntries.map(entry => {
                    const r = bundle.catalog.recommendations.find(r => r.id === entry.recommendationId);
                    return (
                      <details key={entry.recommendationId}>
                        <summary>
                          {r?.title ?? entry.recommendationId} ·{' '}
                          {inheritedIds.has(entry.recommendationId) ? 'inherited / reviewed overrides' : 'added'}
                        </summary>
                        <p>
                          {r?.platform} · {r?.disposition}
                        </p>
                        <ValueTable value={entry.fixedValues} />
                        {Object.keys(entry.parameterDefaults).length > 0 && (
                          <>
                            <h4>Parameter defaults</h4>
                            <ValueTable value={entry.parameterDefaults} />
                          </>
                        )}
                        <h4>Setting rationale</h4>
                        <ValueTable value={entry.settingRationales} />
                        <h4>Override justification</h4>
                        {Object.entries(entry.overrideJustifications).map(([path, reason]) => (
                          <p key={path}>
                            <code>{path}</code>: {textValue(reason)}
                          </p>
                        ))}
                      </details>
                    );
                  })}
                  <AssuranceExclusions entries={preset.exclusions} label="Preset exclusions" />
                </>
              )
            )}
            {(isBaseline || recommendation?.selectable) && (
              <AssuranceReview
                key={JSON.stringify(selection)}
                c={c}
                project={project}
                update={update}
                bundle={bundle}
                selection={selection}
                snapshot={snapshot}
                context={context}
              />
            )}
          </>
        ) : (
          <Empty title={isBaseline ? 'Select a preset' : 'Select a recommendation'}>
            <p>Open a row to inspect its source evidence and prepare a reviewed selection.</p>
          </Empty>
        )}
      </aside>
    </div>
  );
}
function Filter({
  label,
  value,
  onChange,
  values,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  values: (string | {value: string; label: string})[];
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">All</option>
        {values.map(v =>
          typeof v === 'string' ? (
            <option key={v}>{v}</option>
          ) : (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ),
        )}
      </select>
    </Field>
  );
}

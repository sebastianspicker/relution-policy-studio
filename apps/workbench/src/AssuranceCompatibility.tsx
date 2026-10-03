import {useEffect, useState} from 'react';
import type {BaselineTemplateOption, BaselineTemplateOptionsResponse, RecommendationSource} from 'rexp-studio/browser';
import type {EditorController} from './types';
import {Alert, Empty, Field, JsonView} from './ui';
import {request} from './api';

/** Keeps legacy workspace-replacement contracts separate from reviewed exact selections. */
export function AssuranceCompatibility({tab, c}: {tab: string; c: EditorController}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="page-body" onToggle={e => setOpen(e.currentTarget.open)}>
      <summary>
        Compatibility tools: {tab === 'Baselines' ? 'numeric baseline tiers' : 'whole-source ruleset import'}
      </summary>
      {open && <CompatibilityContent tab={tab} c={c} />}
    </details>
  );
}
function CompatibilityContent({tab, c}: {tab: string; c: EditorController}) {
  const [options, setOptions] = useState<readonly BaselineTemplateOption[]>([]);
  const [selected, setSelected] = useState('');
  const [source, setSource] = useState('');
  const [acknowledged, setAcknowledged] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const baseline = tab === 'Baselines';
  const option = selected === '' ? undefined : options[Number(selected)];
  const catalog = source && c.recommendationCatalog?.source === source ? c.recommendationCatalog : undefined;
  const identity = baseline ? 'baseline:' + selected : 'source:' + source + ':' + c.recommendationPlatform;
  useEffect(() => {
    if (!baseline) return;
    let active = true;
    setLoading(true);
    setError('');
    void request<BaselineTemplateOptionsResponse>('/api/baseline-templates')
      .then(value => {
        if (active) setOptions(value.options);
      })
      .catch(e => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [baseline, retry]);
  async function apply() {
    setBusy(true);
    setError('');
    try {
      if (baseline && option) await c.applyBaselineTemplate(option);
      else if (!baseline && catalog) await c.importRecommendationRuleset();
      setAcknowledged('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const selectedRows =
    catalog?.recommendations.filter(
      r => c.recommendationPlatform === 'ALL' || r.platform === c.recommendationPlatform,
    ) ?? [];
  const actionable = selectedRows.filter(r => r.implementation.importableVia.includes('ruleset-import')).length;
  const available = baseline
    ? !!option
    : !!catalog &&
      catalog.actionableImportPlatforms.length > 0 &&
      (c.recommendationPlatform === 'ALL' ||
        catalog.actionableImportPlatforms.includes(catalog.displayToImportPlatform[c.recommendationPlatform] ?? ''));
  return (
    <>
      <p>
        These legacy tools replace the entire policy workspace, including existing policies and sidecar artifacts. They
        use the installed legacy catalogs and preserve their original tier membership and import behavior.
      </p>
      <Alert>
        Workspace replacement is separate from the reviewed recommendation and Relution Policy Studio preset flow above.
        It does not create an exact-selection review receipt. Review the replacement draft and save changes explicitly.
      </Alert>
      {c.isDirty && (
        <p role="status">Save or undo the current policy draft before using a compatibility replacement.</p>
      )}
      {baseline ? (
        <>
          <p>
            Numeric tiers 1, 2, and 3 retain their legacy definitions. They do not correspond to Essential, Managed, or
            High assurance.
          </p>
          {loading && <p role="status">Loading numeric baseline options…</p>}
          <Field label="Legacy numeric baseline">
            <select disabled={loading || busy} value={selected} onChange={e => setSelected(e.target.value)}>
              <option value="">Select platform, numeric tier, and shape</option>
              {options.map((o, i) => (
                <option key={o.platform + o.tier + o.shape} value={i}>
                  {o.platform} · Tier {o.tier} · {o.shape} · {o.tierLabel}
                </option>
              ))}
            </select>
          </Field>
          {!loading && !error && !options.length && <Empty title="No legacy baseline options available" />}
          {option && (
            <>
              <p>
                <strong>
                  {option.platform} · Tier {option.tier} · {option.shape}
                </strong>
                <br />
                {option.sourcePolicy}
                <br />
                {option.coverage}
              </p>
              <p>
                {option.policyCount} policies · {option.ruleCount} rules · {option.actionableRuleCount} actionable ·{' '}
                {option.informationalRuleCount} informational · {option.suppressedConflictRuleCount} suppressed
                conflicts
              </p>
              <details>
                <summary>Legacy baseline membership and metadata</summary>
                <JsonView value={option} />
              </details>
            </>
          )}
        </>
      ) : (
        <>
          <p>
            Import includes the whole selected source ruleset for the selected platform scope. Selecting or filtering an
            individual recommendation above does not limit this import.
          </p>
          <Field label="Legacy whole-source catalog">
            <select
              disabled={busy}
              value={source}
              onChange={e => {
                setSource(e.target.value);
                if (e.target.value) c.setRecommendationSource(e.target.value as RecommendationSource);
              }}
            >
              <option value="">Select a source deliberately</option>
              {(['bsi', 'cis', 'vendor'] as const).map(s => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </Field>
          {source && (
            <Field label="Whole-source import platform scope">
              <select
                disabled={busy || !catalog}
                value={c.recommendationPlatform}
                onChange={e => c.setRecommendationPlatform(e.target.value)}
              >
                <option value="ALL">All source platforms</option>
                {catalog?.displayPlatforms.map(p => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
          )}
          {c.recommendationsLoading && source && <p role="status">Loading source coverage…</p>}
          {c.recommendationsError && source && (
            <Alert>
              {c.recommendationsError}
              <button onClick={c.retryRecommendations}>Retry source catalog</button>
            </Alert>
          )}
          {catalog && (
            <>
              <p>
                {catalog.label} ·{' '}
                {c.recommendationPlatform === 'ALL' ? 'all source platforms' : c.recommendationPlatform}
                <br />
                {catalog.recommendationCount} source recommendations · {selectedRows.length} in selected display scope ·{' '}
                {actionable} marked importable via ruleset
              </p>
              <p className="muted">
                These are catalog coverage counts. The legacy import report identifies the actual imported settings,
                conflicts, and unresolved rules.
              </p>
              <details>
                <summary>Source coverage and platform mapping</summary>
                <JsonView
                  value={{
                    coverage: catalog.coverageSummary,
                    platforms: catalog.actionableImportPlatforms,
                    displayToImportPlatform: catalog.displayToImportPlatform,
                  }}
                />
              </details>
            </>
          )}
        </>
      )}
      {error && (
        <Alert>
          {error}
          {baseline && <button onClick={() => setRetry(v => v + 1)}>Retry baseline options</button>}
        </Alert>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          disabled={!available || c.isDirty || busy}
          checked={acknowledged === identity}
          onChange={e => setAcknowledged(e.target.checked ? identity : '')}
        />
        I deliberately selected this {baseline ? 'numeric baseline' : 'whole-source scope'} and reviewed replacement of
        the entire workspace.
      </label>
      <button
        disabled={
          !available ||
          c.isDirty ||
          busy ||
          acknowledged !== identity ||
          loading ||
          (!baseline && c.recommendationsLoading)
        }
        onClick={() => void apply()}
      >
        {busy
          ? 'Replacing workspace draft…'
          : baseline
            ? 'Replace workspace draft with numeric baseline'
            : 'Replace workspace draft with whole-source ruleset'}
      </button>
      <p className="muted" role="status">
        {c.status}
      </p>
      {c.rulesetReport && (
        <details>
          <summary>Latest legacy ruleset import report</summary>
          <JsonView value={c.rulesetReport} />
        </details>
      )}
    </>
  );
}

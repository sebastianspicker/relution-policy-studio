import { useEffect, useMemo, useState, type JSX } from "react";
import type {
  BaselineExpertMapping,
  BaselineExpertOptionsResponse,
  BaselineExpertSetting,
  BaselineTemplateOption,
  BaselineTemplateOptionsResponse,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../src/baseline-templates.js";
import { RECOMMENDATION_SOURCES } from "../../../src/recommendation-types.js";
import { readJsonResponse } from "./editor-utils.js";
import {
  buildExpertRuleset,
  effectiveMappings,
  effectiveRecommendations,
  effectiveTierMapping,
  expertSettingMatches,
  formatMappingValue,
  moduleNamesForTier,
  platformLabel,
  presetSettingIds,
  settingMatchesSources,
  shapeLabel,
  sourceLabel,
  tierCoverage,
  tierDescription,
  tierWorkspaceCoverage,
  toggleSetting,
  type TierCoverage,
} from "./PolicyWizardPanel.logic.js";
import type { EditorController } from "./types.js";

type WizardMode = "guided" | "expert";

export function PolicyWizardPanel({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  const [options, setOptions] = useState<BaselineTemplateOptionsResponse | undefined>();
  const [expertOptions, setExpertOptions] = useState<BaselineExpertOptionsResponse | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [expertError, setExpertError] = useState<string | undefined>();
  const [mode, setMode] = useState<WizardMode>("guided");
  const [platform, setPlatform] = useState<BaselineTemplatePlatform>("IOS");
  const [tier, setTier] = useState<BaselineTemplateTier>(3);
  const [shape, setShape] = useState<BaselineTemplateShape>("modules");
  const [selectedSettingIds, setSelectedSettingIds] = useState<readonly string[]>([]);
  const [expertQuery, setExpertQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<readonly string[]>(RECOMMENDATION_SOURCES.slice());

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/baseline-templates").then(async (response) => {
      const result = await readJsonResponse<BaselineTemplateOptionsResponse>(response);
      if (cancelled) return;
      if (!response.ok) {
        setLoadError(JSON.stringify(result));
        return;
      }
      setOptions(result);
      const firstPlatform = result.platforms.includes(platform) ? platform : result.platforms[0];
      if (firstPlatform !== undefined) {
        setPlatform(firstPlatform);
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setExpertOptions(undefined);
    setExpertError(undefined);
    const params = new URLSearchParams({ platform, shape });
    void fetch(`/api/baseline-templates/expert?${params.toString()}`).then(async (response) => {
      const result = await readJsonResponse<BaselineExpertOptionsResponse>(response);
      if (cancelled) return;
      if (!response.ok) {
        setExpertError(JSON.stringify(result));
        return;
      }
      setExpertOptions(result);
    }).catch((error: unknown) => {
      if (!cancelled) {
        setExpertError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [platform, shape]);

  useEffect(() => {
    if (expertOptions !== undefined) {
      setSelectedSettingIds(presetSettingIds(expertOptions.settings, tier, selectedSources));
    }
  }, [expertOptions, selectedSources, tier]);

  const availableOptions = options?.options ?? [];
  const selectedOption = availableOptions.find((candidate) =>
    candidate.platform === platform && candidate.tier === tier && candidate.shape === shape,
  );
  const platformOptions = options?.platforms ?? [];
  const tierOptions = useMemo(
    () => [...new Set(availableOptions.filter((candidate) => candidate.platform === platform && candidate.shape === shape).map((candidate) => candidate.tier))].sort(),
    [availableOptions, platform, shape],
  );
  const shapeOptions = options?.shapes ?? [];

  useEffect(() => {
    if (tierOptions.length > 0 && !tierOptions.includes(tier)) {
      setTier(tierOptions[0] ?? 3);
    }
  }, [tier, tierOptions]);

  function chooseTier(nextTier: BaselineTemplateTier): void {
    setTier(nextTier);
    if (mode === "expert" && expertOptions !== undefined) {
      setSelectedSettingIds(presetSettingIds(expertOptions.settings, nextTier, selectedSources));
    }
  }

  return (
    <div className="inspector-content policy-wizard">
      <header className="policy-wizard-header">
        <div>
          <h2>Policy Wizard</h2>
          <p>Build a local workspace from exact BSI/CIS/vendor baseline templates.</p>
        </div>
        {options !== undefined ? (
          <div className="policy-wizard-current" aria-label="Current wizard selection">
            <span>{platformLabel(platform)}</span>
            <span>Tier {tier}</span>
            <span>{shapeLabel(shape)}</span>
          </div>
        ) : null}
      </header>
      {loadError !== undefined ? <p className="error">{loadError}</p> : null}
      {options === undefined && loadError === undefined ? <p className="loading-inline" aria-live="polite">Loading baseline templates...</p> : null}
      {options !== undefined ? (
        <>
          <div className="recommendation-source-switcher" role="tablist" aria-label="Wizard mode">
            {(["guided", "expert"] as const).map((candidate) => (
              <button key={candidate} type="button" role="tab" aria-selected={mode === candidate} className={mode === candidate ? "active" : ""} onClick={() => setMode(candidate)}>
                {candidate === "guided" ? "Guided baseline" : "Expert selection"}
              </button>
            ))}
          </div>
          <section className="policy-wizard-step" aria-labelledby="wizard-scope-heading">
            <div>
              <h3 id="wizard-scope-heading">1. Scope</h3>
              <p>Choose the platform and whether the generated workspace is modular or consolidated.</p>
            </div>
            <WizardControls
              platform={platform}
              shape={shape}
              platformOptions={platformOptions}
              shapeOptions={shapeOptions}
              selectedSources={selectedSources}
              onPlatformChange={setPlatform}
              onShapeChange={setShape}
              onSourcesChange={setSelectedSources}
            />
          </section>
          <section className="policy-wizard-step" aria-labelledby="wizard-tier-heading">
            <div>
              <h3 id="wizard-tier-heading">2. Security tier</h3>
              <p>Pick the baseline strength before previewing or selecting individual settings.</p>
            </div>
            <TierSelector
              availableOptions={availableOptions}
              expertOptions={expertOptions}
              platform={platform}
              shape={shape}
              tier={tier}
              selectedSources={selectedSources}
              onTierChange={chooseTier}
            />
          </section>
          {mode === "guided" ? (
            <GuidedWizard
              selectedOption={selectedOption}
              expertOptions={expertOptions}
              platform={platform}
              tier={tier}
              shape={shape}
              selectedSources={selectedSources}
              controller={c}
            />
          ) : (
            <ExpertWizard
              controller={c}
              expertOptions={expertOptions}
              error={expertError}
              query={expertQuery}
              selectedSettingIds={selectedSettingIds}
              selectedSources={selectedSources}
              tier={tier}
              onQueryChange={setExpertQuery}
              onSelectedSettingIdsChange={setSelectedSettingIds}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function WizardControls(props: {
  readonly platform: BaselineTemplatePlatform;
  readonly shape: BaselineTemplateShape;
  readonly platformOptions: readonly BaselineTemplatePlatform[];
  readonly shapeOptions: readonly BaselineTemplateShape[];
  readonly selectedSources: readonly string[];
  readonly onPlatformChange: (platform: BaselineTemplatePlatform) => void;
  readonly onShapeChange: (shape: BaselineTemplateShape) => void;
  readonly onSourcesChange: (sources: readonly string[]) => void;
}): JSX.Element {
  return (
    <div className="recommendation-controls policy-wizard-controls">
      <label>
        Platform
        <select value={props.platform} onChange={(event) => props.onPlatformChange(event.target.value as BaselineTemplatePlatform)}>
          {props.platformOptions.map((candidate) => <option key={candidate} value={candidate}>{platformLabel(candidate)}</option>)}
        </select>
      </label>
      <label>
        Shape
        <select value={props.shape} onChange={(event) => props.onShapeChange(event.target.value as BaselineTemplateShape)}>
          {props.shapeOptions.map((candidate) => <option key={candidate} value={candidate}>{shapeLabel(candidate)}</option>)}
        </select>
      </label>
      <fieldset className="policy-wizard-sources">
        <legend>Sources</legend>
        {RECOMMENDATION_SOURCES.map((source) => (
          <label key={source} className="checkbox-control">
            <input type="checkbox" checked={props.selectedSources.includes(source)}
              onChange={(e) => props.onSourcesChange(e.target.checked ? [...props.selectedSources, source] : props.selectedSources.filter((s) => s !== source))} />
            <span>{sourceLabel(source)}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function TierSelector(props: {
  readonly availableOptions: readonly BaselineTemplateOption[];
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly platform: BaselineTemplatePlatform;
  readonly shape: BaselineTemplateShape;
  readonly tier: BaselineTemplateTier;
  readonly selectedSources: readonly string[];
  readonly onTierChange: (tier: BaselineTemplateTier) => void;
}): JSX.Element {
  const allSourcesSelected = props.selectedSources.length === RECOMMENDATION_SOURCES.length;
  return (
    <div className="policy-wizard-tier-grid" role="radiogroup" aria-label="Security tier">
      {[3, 2, 1].map((candidateTier) => {
        const option = props.availableOptions.find((candidate) =>
          candidate.platform === props.platform && candidate.tier === candidateTier && candidate.shape === props.shape,
        );
        const tierSettings = props.expertOptions?.settings.filter((s) =>
          s.requiredInTiers.includes(candidateTier as BaselineTemplateTier),
        ) ?? [];
        const filteredSettings = tierSettings.filter((s) => settingMatchesSources(s, props.selectedSources, candidateTier as BaselineTemplateTier));
        const filteredRuleCount = props.expertOptions !== undefined ? filteredSettings.length : undefined;
        const showFiltered = !allSourcesSelected && filteredRuleCount !== undefined && option !== undefined;
        const moduleNames = props.expertOptions !== undefined ? moduleNamesForTier(props.expertOptions.settings, candidateTier as BaselineTemplateTier, props.selectedSources) : undefined;
        const policyCount = moduleNames?.length ?? option?.policyCount ?? 0;
        return (
          <button
            key={candidateTier}
            type="button"
            className="policy-wizard-tier"
            aria-checked={props.tier === candidateTier}
            role="radio"
            disabled={option === undefined}
            onClick={() => props.onTierChange(candidateTier as BaselineTemplateTier)}
          >
            <span className="policy-wizard-tier-title">
              <strong>Tier {candidateTier}</strong>
              {option !== undefined ? (
                showFiltered
                  ? <span>{filteredRuleCount} <span className="policy-wizard-tier-total">/ {option.ruleCount} rules</span></span>
                  : <span>{option.ruleCount} rules</span>
              ) : <span>Unavailable</span>}
            </span>
            <span>{tierDescription(candidateTier as BaselineTemplateTier)}</span>
            {option !== undefined ? (
              <>
                <small>{option.stakeholderExamples.join(", ")}</small>
                <span className="policy-wizard-tier-meta">
                  <span>{policyCount} {policyCount === 1 ? "policy" : "policies"}</span>
                  <span>{option.actionableRuleCount} actionable</span>
                  {option.suppressedConflictRuleCount > 0 ? (
                    <span title="Source rules dropped due to irreconcilable conflicts">{option.suppressedConflictRuleCount} conflicts resolved</span>
                  ) : null}
                </span>
                {moduleNames !== undefined && moduleNames.length > 0 ? (
                  <span className="policy-wizard-tier-modules" aria-label="Policy modules">
                    {moduleNames.map((name) => <span key={name} className="policy-wizard-tier-module">{name}</span>)}
                  </span>
                ) : null}
              </>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function GuidedWizard(props: {
  readonly selectedOption: BaselineTemplateOption | undefined;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly platform: BaselineTemplatePlatform;
  readonly tier: BaselineTemplateTier;
  readonly shape: BaselineTemplateShape;
  readonly selectedSources: readonly string[];
  readonly controller: EditorController;
}): JSX.Element {
  const allSourcesSelected = props.selectedSources.length === RECOMMENDATION_SOURCES.length;
  const filteredSettings = props.expertOptions?.settings.filter((s) =>
    s.requiredInTiers.includes(props.tier) && settingMatchesSources(s, props.selectedSources, props.tier),
  );
  const filteredRuleCount = filteredSettings?.length;
  const filteredPolicyCount = props.expertOptions !== undefined ? moduleNamesForTier(props.expertOptions.settings, props.tier, props.selectedSources).length : undefined;
  const sourceLabelText = props.selectedSources.length === 0 ? "No sources" : props.selectedSources.map(sourceLabel).join("+");
  const summary = props.selectedOption === undefined
    ? "No baseline ready"
    : !allSourcesSelected && filteredRuleCount !== undefined
      ? `${filteredRuleCount} / ${props.selectedOption.ruleCount} rules (${sourceLabelText} filtered), ${filteredPolicyCount ?? 0} policies`
      : `${props.selectedOption.policyCount} policies, ${props.selectedOption.ruleCount} rules ready`;
  const filteredRuleset = props.expertOptions !== undefined && filteredSettings !== undefined
    ? buildExpertRuleset(props.expertOptions, props.tier, new Set(filteredSettings.map((setting) => setting.id)), props.selectedSources)
    : undefined;
  const disabled = props.selectedOption === undefined || (!allSourcesSelected && (filteredRuleset === undefined || filteredRuleset.policies.length === 0));
  return (
    <section className="policy-wizard-step policy-wizard-review" aria-labelledby="wizard-review-heading">
      <div>
        <h3 id="wizard-review-heading">3. Preview and apply</h3>
        <p>Review the generated baseline before replacing the local workspace.</p>
      </div>
      {props.selectedOption !== undefined
        ? <TemplatePreview
            option={props.selectedOption}
            expertOptions={props.expertOptions}
            tier={props.tier}
            selectedSources={props.selectedSources}
            filteredRuleCount={filteredRuleCount}
            filteredPolicyCount={filteredPolicyCount}
          />
        : <p className="empty-state">No baseline template exists for this selection.</p>}
      <WizardActionBar
        actionLabel="Replace workspace with selected baseline"
        disabled={disabled}
        disabledReason={props.selectedOption === undefined ? "No baseline template is available for this selection." : "Select at least one source-backed setting before applying this baseline."}
        summary={summary}
        onApply={() => {
          if (allSourcesSelected) {
            void props.controller.applyBaselineTemplate({ platform: props.platform, tier: props.tier, shape: props.shape });
            return;
          }
          if (filteredRuleset !== undefined) {
            void props.controller.applyExpertBaselineSelection(filteredRuleset);
          }
        }}
      />
    </section>
  );
}

function ExpertWizard(props: {
  readonly controller: EditorController;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly error: string | undefined;
  readonly query: string;
  readonly selectedSettingIds: readonly string[];
  readonly selectedSources: readonly string[];
  readonly tier: BaselineTemplateTier;
  readonly onQueryChange: (query: string) => void;
  readonly onSelectedSettingIdsChange: (ids: readonly string[]) => void;
}): JSX.Element {
  if (props.error !== undefined) {
    return <p className="error">{props.error}</p>;
  }
  if (props.expertOptions === undefined) {
    return <p className="loading-inline" aria-live="polite">Loading expert settings...</p>;
  }
  const expertOptions = props.expertOptions;
  const selectedSet = new Set(props.selectedSettingIds);
  const filteredSettings = expertOptions.settings.filter((setting) => expertSettingMatches(setting, props.query));
  const selectedCoverage = tierCoverage(expertOptions.settings, selectedSet, props.selectedSources);
  const workspaceCoverage = tierWorkspaceCoverage(expertOptions.settings, props.controller.state.workspace, props.selectedSources);
  const ruleset = buildExpertRuleset(expertOptions, props.tier, selectedSet, props.selectedSources);
  const selectedCount = props.selectedSettingIds.length;
  const readyPolicyCount = ruleset.policies.length;
  return (
    <section className="policy-wizard-step" aria-labelledby="wizard-expert-heading">
      <div>
        <h3 id="wizard-expert-heading">3. Select settings</h3>
        <p>Use expert mode when you want exact settings and recommendation evidence before generation.</p>
      </div>
      <div className="policy-wizard-expert-layout">
        <aside className="policy-wizard-expert-summary" aria-label="Expert selection summary">
          <div className="policy-wizard-selection-count" aria-label={`${selectedCount} of ${expertOptions.settings.length} settings selected`} aria-live="polite">
            <strong>{selectedCount}</strong>
            <span>of {expertOptions.settings.length} settings selected</span>
          </div>
          <div className="policy-wizard-coverage" aria-label="Expert coverage">
            <CoverageGroup title="Selected baseline coverage" coverage={selectedCoverage} />
            <CoverageGroup title="Current workspace compliance" coverage={workspaceCoverage} />
          </div>
          <div className="policy-wizard-bulk-actions" aria-label="Selection actions">
            <button type="button" onClick={() => props.onSelectedSettingIdsChange(presetSettingIds(expertOptions.settings, props.tier, props.selectedSources))}>
              Select tier {props.tier}
            </button>
            <button type="button" onClick={() => props.onSelectedSettingIdsChange(presetSettingIds(expertOptions.settings, props.tier, props.selectedSources))}>
              Select all
            </button>
            <button type="button" onClick={() => props.onSelectedSettingIdsChange([])}>
              Clear
            </button>
          </div>
          <WizardActionBar
            actionLabel="Replace workspace with expert selection"
            disabled={readyPolicyCount === 0}
            disabledReason="Select at least one source-backed setting before applying an expert baseline."
            summary={readyPolicyCount === 0 ? "No settings selected" : `${selectedCount} settings, ${readyPolicyCount} policies ready`}
            onApply={() => void props.controller.applyExpertBaselineSelection(ruleset)}
          />
        </aside>
        <div className="policy-wizard-expert-main">
          <label className="policy-wizard-search">
            Search settings
            <input type="search" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
          </label>
          <div className="policy-wizard-setting-list">
            {filteredSettings.length > 0 ? filteredSettings.map((setting) => (
              <ExpertSettingRow
                key={setting.id}
                setting={setting}
                checked={selectedSet.has(setting.id)}
                tier={props.tier}
                selectedSources={props.selectedSources}
                onChange={(checked) => props.onSelectedSettingIdsChange(toggleSetting(props.selectedSettingIds, setting.id, checked))}
              />
            )) : <p className="empty-state">No settings match the current search.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExpertSettingRow(props: {
  readonly setting: BaselineExpertSetting;
  readonly checked: boolean;
  readonly tier: BaselineTemplateTier;
  readonly selectedSources: readonly string[];
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  const mappings = effectiveMappings(props.setting, props.tier);
  const sourceMatched = settingMatchesSources(props.setting, props.selectedSources, props.tier);
  const tierMapping = effectiveTierMapping(props.setting, props.tier);
  const policyName = tierMapping?.policyName ?? props.setting.policyName;
  const ruleTitle = tierMapping?.ruleTitle ?? props.setting.ruleTitle;
  const reason = tierMapping?.reason ?? props.setting.reason;
  const recommendations = effectiveRecommendations(props.setting, props.tier);
  return (
    <article className={["policy-wizard-setting", props.checked ? "selected" : "", !sourceMatched ? "policy-wizard-setting--source-muted" : ""].filter(Boolean).join(" ")}>
      <label className="checkbox-control">
        <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
        <span>
          <strong>{props.setting.label}</strong>
          <small>{policyName} | required in tiers {props.setting.requiredInTiers.join(", ")}</small>
          <span className="policy-wizard-setting-badges" aria-label="Recommendation sources">
            {recommendations.map((recommendation) => {
              const active = props.selectedSources.includes(recommendation.source);
              return (
                <span
                  key={`${recommendation.source}:${recommendation.ruleId}`}
                  className={active ? "compliance-stat compliance-stat--unknown" : "compliance-stat compliance-stat--unknown policy-wizard-source-badge--inactive"}
                >
                  {recommendation.source.toUpperCase()} {recommendation.ruleId}
                </span>
              );
            })}
          </span>
        </span>
      </label>
      <details>
        <summary>Recommendations and values</summary>
        {reason !== undefined ? <p>{reason}</p> : null}
        <dl className="preview-summary">
          <div>
            <dt>Rule</dt>
            <dd>{ruleTitle}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{mappings.map((mapping) => mapping.target).join(", ")}</dd>
          </div>
          <div>
            <dt>Values</dt>
            <dd><MappingValues mappings={mappings} /></dd>
          </div>
        </dl>
        <SourceRecommendationList recommendations={recommendations} selectedSources={props.selectedSources} />
      </details>
    </article>
  );
}

function SourceRecommendationList({
  recommendations,
  selectedSources,
}: {
  readonly recommendations: BaselineExpertSetting["recommendations"];
  readonly selectedSources: readonly string[];
}): JSX.Element {
  return (
    <div className="policy-wizard-module-list" aria-label="Source recommendation evidence">
      <strong>Source recommendations</strong>
      <ul>
        {recommendations.map((recommendation) => {
          const active = selectedSources.includes(recommendation.source);
          return (
            <li key={`${recommendation.source}:${recommendation.ruleId}`} className={active ? "" : "policy-wizard-source-badge--inactive"}>
              <span>{sourceLabel(recommendation.source)} {recommendation.ruleId}: {recommendation.title}</span>
              {recommendation.reason !== undefined ? <small>{recommendation.reason}</small> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CoverageGroup({ title, coverage }: { readonly title: string; readonly coverage: readonly TierCoverage[] }): JSX.Element {
  return (
    <section className="policy-wizard-coverage-group">
      <h3>{title}</h3>
      <div className="policy-wizard-coverage-list">
        {coverage.map((entry) => (
          <div key={entry.tier} className="policy-wizard-coverage-row">
            <span>Tier {entry.tier}</span>
            <meter min={0} max={100} value={entry.percent} aria-label={`Tier ${entry.tier} coverage`} />
            <strong>{entry.percent}%</strong>
            <small>{entry.matched}/{entry.total}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplatePreview(props: {
  readonly option: BaselineTemplateOption;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly tier: BaselineTemplateTier;
  readonly selectedSources: readonly string[];
  readonly filteredRuleCount: number | undefined;
  readonly filteredPolicyCount: number | undefined;
}): JSX.Element {
  const { option } = props;
  const allSourcesSelected = props.selectedSources.length === RECOMMENDATION_SOURCES.length;
  const moduleNames = props.expertOptions !== undefined ? moduleNamesForTier(props.expertOptions.settings, props.tier, props.selectedSources) : undefined;
  const shownPolicyCount = !allSourcesSelected && props.filteredPolicyCount !== undefined ? props.filteredPolicyCount : option.policyCount;
  const shownActionableCount = !allSourcesSelected && props.filteredRuleCount !== undefined ? props.filteredRuleCount : option.actionableRuleCount;
  return (
    <section className="preview-block policy-wizard-preview" aria-label="Baseline preview">
      <h3>{option.tierLabel}</h3>
      <dl className="preview-summary">
        <div>
          <dt>Policies</dt>
          <dd>{shownPolicyCount}{option.coverage === "distinct" ? <span className="policy-wizard-tier-total" title="Each tier is a self-contained baseline, not cumulative"> · independent</span> : null}</dd>
        </div>
        <div>
          <dt>Rules</dt>
          <dd>
            {!allSourcesSelected && props.filteredRuleCount !== undefined
              ? <><strong>{props.filteredRuleCount}</strong> <span className="policy-wizard-tier-total">/ {option.ruleCount} total</span></>
              : option.ruleCount}
            <span className="policy-wizard-tier-total" title="Each module contains one consolidated rule merging all source settings"> · 1 per module</span>
          </dd>
        </div>
        <div><dt>Actionable</dt><dd>{shownActionableCount}</dd></div>
        <div><dt>Informational</dt><dd>{option.informationalRuleCount}</dd></div>
        {option.suppressedConflictRuleCount > 0 ? <div><dt title="Source settings dropped due to irreconcilable conflicts">Conflicts resolved</dt><dd>{option.suppressedConflictRuleCount}</dd></div> : null}
        <div><dt>Security</dt><dd>{option.securityLevel}</dd></div>
        <div>
          <dt>Sources</dt>
          <dd>{RECOMMENDATION_SOURCES.map((s) => (
            <span key={s} className={`compliance-stat compliance-stat--unknown${props.selectedSources.includes(s) ? "" : " policy-wizard-source-badge--inactive"}`}>{sourceLabel(s)}</span>
          ))}</dd>
        </div>
      </dl>
      {moduleNames !== undefined && moduleNames.length > 0 ? (
        <div className="policy-wizard-module-list" aria-label="Included policy modules">
          <strong>Modules included</strong>
          <ul>{moduleNames.map((name) => <li key={name}>{name}</li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

function WizardActionBar(props: {
  readonly actionLabel: string;
  readonly disabled: boolean;
  readonly disabledReason: string;
  readonly summary: string;
  readonly onApply: () => void;
}): JSX.Element {
  return (
    <div className="policy-wizard-actions">
      <span>{props.disabled ? props.disabledReason : props.summary}</span>
      <button type="button" className="btn-primary" disabled={props.disabled} title={props.disabled ? props.disabledReason : undefined} onClick={props.onApply}>
        {props.actionLabel}
      </button>
    </div>
  );
}

function MappingValues({ mappings }: { readonly mappings: readonly BaselineExpertMapping[] }): JSX.Element {
  const entries = mappings.flatMap((mapping) => Object.entries(mapping.values).map(([key, value]) => ({
    key: `${mapping.target}:${key}`,
    label: key,
    value,
  })));
  if (entries.length === 0) {
    return <span className="policy-wizard-muted">No values for this tier.</span>;
  }
  return (
    <table className="policy-wizard-value-table">
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.key}>
            <th scope="row">{entry.label}</th>
            <td><code>{formatMappingValue(entry.value)}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

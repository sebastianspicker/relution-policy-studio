/** Renders the constrained baseline-template flow for common policy choices. */
import { useMemo, type JSX } from "react";
import type {
  BaselineExpertOptionsResponse,
  BaselineTemplateOption,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { RECOMMENDATION_SOURCES } from "../../../../src/browser/assurance.js";
import {
  moduleNamesForTier,
  settingMatchesSources,
} from "./policy-wizard-evidence.js";
import { buildExpertRuleset } from "./policy-wizard-ruleset.js";
import { sourceLabel } from "./policy-wizard-labels.js";
import type { BaselineExpertApplyRuleset } from "./baseline-template-client.js";
import type { EditorController } from "../../shared/editor-contracts.js";

export function PolicyWizardGuided(props: {
  readonly selectedOption: BaselineTemplateOption | undefined;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly platform: BaselineTemplatePlatform;
  readonly tier: BaselineTemplateTier;
  readonly shape: BaselineTemplateShape;
  readonly selectedSources: readonly string[];
  readonly controller: EditorController;
}): JSX.Element {
  const filteredSettings = useMemo(() => props.expertOptions?.settings.filter((setting) =>
    setting.requiredInTiers.includes(props.tier) && settingMatchesSources(setting, props.selectedSources, props.tier),
  ), [props.expertOptions, props.tier, props.selectedSources]);
  const filteredPolicyCount = useMemo(() => filteredPolicyCountFor(props.expertOptions, props.tier, props.selectedSources), [props.expertOptions, props.tier, props.selectedSources]);
  const filteredRuleset = useMemo(() => props.expertOptions !== undefined && filteredSettings !== undefined
    ? buildExpertRuleset(props.expertOptions, props.tier, new Set(filteredSettings.map((setting) => setting.id)), props.selectedSources)
    : undefined, [props.expertOptions, props.tier, filteredSettings, props.selectedSources]);
  const allSourcesSelected = sourcesAreUnfiltered(props.selectedSources);
  const disabled = guidedApplyDisabled(props.selectedOption, allSourcesSelected, filteredRuleset);

  function applySelectedBaseline(): void {
    if (allSourcesSelected) {
      void props.controller.applyBaselineTemplate({ platform: props.platform, tier: props.tier, shape: props.shape });
      return;
    }
    if (filteredRuleset !== undefined) {
      void props.controller.applyExpertBaselineSelection(filteredRuleset);
    }
  }

  return (
    <section className="policy-wizard-step policy-wizard-review" aria-labelledby="wizard-review-heading">
      <div>
        <h3 id="wizard-review-heading">3. Preview and apply</h3>
        <p>Review the generated baseline before replacing the local workspace.</p>
      </div>
      {props.selectedOption !== undefined ? (
        <TemplatePreview
          option={props.selectedOption}
          expertOptions={props.expertOptions}
          tier={props.tier}
          selectedSources={props.selectedSources}
          filteredRuleCount={filteredSettings?.length}
          filteredPolicyCount={filteredPolicyCount}
        />
      ) : <p className="empty-state">No baseline template exists for this selection.</p>}
      <WizardActionBar
        actionLabel="Replace workspace with selected baseline"
        disabled={disabled}
        disabledReason={props.selectedOption === undefined ? "No baseline template is available for this selection." : "Select at least one source-backed setting before applying this baseline."}
        summary={guidedSummary(props, filteredSettings?.length, filteredPolicyCount)}
        onApply={applySelectedBaseline}
      />
    </section>
  );
}

function sourcesAreUnfiltered(selectedSources: readonly string[]): boolean {
  return selectedSources.length === RECOMMENDATION_SOURCES.length;
}

function filteredPolicyCountFor(
  expertOptions: BaselineExpertOptionsResponse | undefined,
  tier: BaselineTemplateTier,
  selectedSources: readonly string[],
): number | undefined {
  return expertOptions === undefined ? undefined : moduleNamesForTier(expertOptions.settings, tier, selectedSources).length;
}

function guidedSummary(
  props: Parameters<typeof PolicyWizardGuided>[0],
  filteredRuleCount: number | undefined,
  filteredPolicyCount: number | undefined,
): string {
  if (props.selectedOption === undefined) return "No baseline ready";
  if (!sourcesAreUnfiltered(props.selectedSources) && filteredRuleCount !== undefined) {
    const sources = props.selectedSources.length === 0 ? "No sources" : props.selectedSources.map(sourceLabel).join("+");
    return `${filteredRuleCount} / ${props.selectedOption.ruleCount} rules (${sources} filtered), ${filteredPolicyCount ?? 0} policies`;
  }
  return `${props.selectedOption.policyCount} policies, ${props.selectedOption.ruleCount} rules ready`;
}

function guidedApplyDisabled(
  selectedOption: BaselineTemplateOption | undefined,
  allSourcesSelected: boolean,
  filteredRuleset: BaselineExpertApplyRuleset | undefined,
): boolean {
  return selectedOption === undefined || (!allSourcesSelected && (filteredRuleset === undefined || filteredRuleset.policies.length === 0));
}

function TemplatePreview(props: {
  readonly option: BaselineTemplateOption;
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly tier: BaselineTemplateTier;
  readonly selectedSources: readonly string[];
  readonly filteredRuleCount: number | undefined;
  readonly filteredPolicyCount: number | undefined;
}): JSX.Element {
  const allSourcesSelected = sourcesAreUnfiltered(props.selectedSources);
  const moduleNames = useMemo(() => props.expertOptions === undefined ? undefined : moduleNamesForTier(props.expertOptions.settings, props.tier, props.selectedSources), [props.expertOptions, props.tier, props.selectedSources]);
  const shownPolicyCount = !allSourcesSelected && props.filteredPolicyCount !== undefined ? props.filteredPolicyCount : props.option.policyCount;
  const shownActionableCount = !allSourcesSelected && props.filteredRuleCount !== undefined ? props.filteredRuleCount : props.option.actionableRuleCount;
  return (
    <section className="preview-block policy-wizard-preview" aria-label="Baseline preview">
      <h3>{props.option.tierLabel}</h3>
      <dl className="preview-summary">
        <div><dt>Policies</dt><dd>{shownPolicyCount}{props.option.coverage === "distinct" ? <span className="policy-wizard-tier-total" title="Each tier is a self-contained baseline, not cumulative"> · independent</span> : null}</dd></div>
        <div>
          <dt>Rules</dt>
          <dd>
            {!allSourcesSelected && props.filteredRuleCount !== undefined ? <><strong>{props.filteredRuleCount}</strong> <span className="policy-wizard-tier-total">/ {props.option.ruleCount} total</span></> : props.option.ruleCount}
            <span className="policy-wizard-tier-total" title="Each module contains one consolidated rule merging all source settings"> · 1 per module</span>
          </dd>
        </div>
        <div><dt>Actionable</dt><dd>{shownActionableCount}</dd></div>
        <div><dt>Informational</dt><dd>{props.option.informationalRuleCount}</dd></div>
        {props.option.suppressedConflictRuleCount > 0 ? <div><dt title="Source settings dropped due to irreconcilable conflicts">Conflicts resolved</dt><dd>{props.option.suppressedConflictRuleCount}</dd></div> : null}
        <div><dt>Security</dt><dd>{props.option.securityLevel}</dd></div>
        <div><dt>Sources</dt><dd>{RECOMMENDATION_SOURCES.map((source) => <span key={source} className={`compliance-stat compliance-stat--unknown${props.selectedSources.includes(source) ? "" : " policy-wizard-source-badge--inactive"}`}>{sourceLabel(source)}</span>)}</dd></div>
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

export function WizardActionBar(props: {
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

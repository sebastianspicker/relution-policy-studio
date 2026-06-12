import type { JSX } from "react";
import type {
  BaselineExpertOptionsResponse,
  BaselineTemplateOption,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../src/baseline-templates.js";
import { RECOMMENDATION_SOURCES } from "../../../src/recommendation-types.js";
import { moduleNamesForTier, settingMatchesSources, tierDescription } from "./PolicyWizardPanel.logic.js";

export function TierSelector(props: {
  readonly availableOptions: readonly BaselineTemplateOption[];
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly platform: BaselineTemplatePlatform;
  readonly shape: BaselineTemplateShape;
  readonly tier: BaselineTemplateTier;
  readonly selectedSources: readonly string[];
  readonly onTierChange: (tier: BaselineTemplateTier) => void;
}): JSX.Element {
  const allSourcesSelected = props.selectedSources.length === RECOMMENDATION_SOURCES.length;
  const cards = ([3, 2, 1] as const).map((candidateTier) =>
    tierCardState(candidateTier, props, allSourcesSelected),
  );
  return (
    <div className="policy-wizard-tier-grid" role="radiogroup" aria-label="Security tier">
      {cards.map((card) => <TierButton key={card.tier} card={card} selected={props.tier === card.tier} onTierChange={props.onTierChange} />)}
    </div>
  );
}

type TierSelectorProps = Parameters<typeof TierSelector>[0];

interface TierCardState {
  readonly tier: BaselineTemplateTier;
  readonly option: BaselineTemplateOption | undefined;
  readonly filteredRuleCount: number | undefined;
  readonly showFiltered: boolean;
  readonly moduleNames: readonly string[] | undefined;
  readonly policyCount: number;
}

function tierCardState(tier: BaselineTemplateTier, props: TierSelectorProps, allSourcesSelected: boolean): TierCardState {
  const option = selectedBaselineOption(props.availableOptions, props.platform, tier, props.shape);
  const filteredRuleCount = filteredRuleCountForTier(props.expertOptions, tier, props.selectedSources);
  const moduleNames = moduleNamesForAvailableTier(props.expertOptions, tier, props.selectedSources);
  return {
    tier,
    option,
    filteredRuleCount,
    showFiltered: !allSourcesSelected && filteredRuleCount !== undefined && option !== undefined,
    moduleNames,
    policyCount: moduleNames?.length ?? option?.policyCount ?? 0,
  };
}

function selectedBaselineOption(
  options: readonly BaselineTemplateOption[],
  platform: BaselineTemplatePlatform,
  tier: BaselineTemplateTier,
  shape: BaselineTemplateShape,
): BaselineTemplateOption | undefined {
  return options.find((candidate) => candidate.platform === platform && candidate.tier === tier && candidate.shape === shape);
}

function filteredRuleCountForTier(
  expertOptions: BaselineExpertOptionsResponse | undefined,
  tier: BaselineTemplateTier,
  selectedSources: readonly string[],
): number | undefined {
  if (expertOptions === undefined) {
    return undefined;
  }
  const tierSettings = expertOptions.settings.filter((setting) => setting.requiredInTiers.includes(tier));
  return tierSettings.filter((setting) => settingMatchesSources(setting, selectedSources, tier)).length;
}

function moduleNamesForAvailableTier(
  expertOptions: BaselineExpertOptionsResponse | undefined,
  tier: BaselineTemplateTier,
  selectedSources: readonly string[],
): readonly string[] | undefined {
  return expertOptions === undefined ? undefined : moduleNamesForTier(expertOptions.settings, tier, selectedSources);
}

function TierButton(props: {
  readonly card: TierCardState;
  readonly selected: boolean;
  readonly onTierChange: (tier: BaselineTemplateTier) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="policy-wizard-tier"
      aria-checked={props.selected}
      role="radio"
      disabled={props.card.option === undefined}
      onClick={() => props.onTierChange(props.card.tier)}
    >
      <TierButtonTitle card={props.card} />
      <span>{tierDescription(props.card.tier)}</span>
      {props.card.option !== undefined ? <TierButtonDetails card={props.card} option={props.card.option} /> : null}
    </button>
  );
}

function TierButtonTitle({ card }: { readonly card: TierCardState }): JSX.Element {
  return (
    <span className="policy-wizard-tier-title">
      <strong>Tier {card.tier}</strong>
      {card.option !== undefined ? (
        card.showFiltered
          ? <span>{card.filteredRuleCount} <span className="policy-wizard-tier-total">/ {card.option.ruleCount} rules</span></span>
          : <span>{card.option.ruleCount} rules</span>
      ) : <span>Unavailable</span>}
    </span>
  );
}

function TierButtonDetails(props: {
  readonly card: TierCardState;
  readonly option: BaselineTemplateOption;
}): JSX.Element {
  return (
    <>
      <small>{props.option.stakeholderExamples.join(", ")}</small>
      <span className="policy-wizard-tier-meta">
        <span>{props.card.policyCount} {props.card.policyCount === 1 ? "policy" : "policies"}</span>
        <span>{props.option.actionableRuleCount} actionable</span>
        {props.option.suppressedConflictRuleCount > 0 ? (
          <span title="Source rules dropped due to irreconcilable conflicts">{props.option.suppressedConflictRuleCount} conflicts resolved</span>
        ) : null}
      </span>
      {props.card.moduleNames !== undefined && props.card.moduleNames.length > 0 ? (
        <span className="policy-wizard-tier-modules" aria-label="Policy modules">
          {props.card.moduleNames.map((name) => <span key={name} className="policy-wizard-tier-module">{name}</span>)}
        </span>
      ) : null}
    </>
  );
}

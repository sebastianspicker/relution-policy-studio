/** Derives tier-card availability and filtered recommendation counts. */
import type {
  BaselineExpertOptionsResponse,
  BaselineTemplateOption,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { RECOMMENDATION_SOURCES } from "../../../../src/browser/assurance.js";
import { moduleNamesForTier, settingMatchesSources } from "./policy-wizard-evidence.js";
import { selectedBaselineOption } from "./policy-wizard-option-selection.js";

export interface TierSelectorProps {
  readonly availableOptions: readonly BaselineTemplateOption[];
  readonly expertOptions: BaselineExpertOptionsResponse | undefined;
  readonly platform: BaselineTemplatePlatform;
  readonly shape: BaselineTemplateShape;
  readonly tier: BaselineTemplateTier;
  readonly selectedSources: readonly string[];
  readonly onTierChange: (tier: BaselineTemplateTier) => void;
}

export interface TierCardState {
  readonly tier: BaselineTemplateTier;
  readonly option: BaselineTemplateOption | undefined;
  readonly filteredRuleCount: number | undefined;
  readonly showFiltered: boolean;
  readonly moduleNames: readonly string[] | undefined;
  readonly policyCount: number;
}

export function tierCardStates(props: TierSelectorProps): readonly TierCardState[] {
  const allSourcesSelected = props.selectedSources.length === RECOMMENDATION_SOURCES.length;
  return ([3, 2, 1] as const).map((tier) => tierCardState(tier, props, allSourcesSelected));
}

function tierCardState(tier: BaselineTemplateTier, props: TierSelectorProps, allSourcesSelected: boolean): TierCardState {
  const option = selectedBaselineOption(props.availableOptions, props.platform, tier, props.shape);
  const filteredRuleCount = filteredRuleCountForTier(props.expertOptions, tier, props.selectedSources);
  const moduleNames = props.expertOptions === undefined
    ? undefined
    : moduleNamesForTier(props.expertOptions.settings, tier, props.selectedSources);
  return {
    tier,
    option,
    filteredRuleCount,
    showFiltered: !allSourcesSelected && filteredRuleCount !== undefined && option !== undefined,
    moduleNames,
    policyCount: moduleNames?.length ?? option?.policyCount ?? 0,
  };
}

function filteredRuleCountForTier(
  expertOptions: BaselineExpertOptionsResponse | undefined,
  tier: BaselineTemplateTier,
  selectedSources: readonly string[],
): number | undefined {
  if (expertOptions === undefined) return undefined;
  return expertOptions.settings.filter((setting) =>
    setting.requiredInTiers.includes(tier) && settingMatchesSources(setting, selectedSources, tier),
  ).length;
}

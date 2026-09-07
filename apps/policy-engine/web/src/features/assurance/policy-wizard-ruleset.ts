/** Builds a reviewable ruleset from the expert wizard selection. */
import type {
  BaselineExpertOptionsResponse,
  BaselineExpertSetting,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import type { BaselineExpertApplyRuleset } from "./baseline-template-client.js";
import {
  effectiveMappings,
  effectiveRecommendations,
  effectiveTierMapping,
  settingMatchesSources,
} from "./policy-wizard-evidence.js";
import { platformLabel } from "./policy-wizard-labels.js";

type ExpertPolicyGroup = {
  description?: string;
  rules: BaselineExpertApplyRuleset["policies"][number]["rules"];
};

export function buildExpertRuleset(options: BaselineExpertOptionsResponse, tier: BaselineTemplateTier, selected: ReadonlySet<string>, sources: readonly string[]): BaselineExpertApplyRuleset {
  const grouped = new Map<string, ExpertPolicyGroup>();
  for (const setting of selectedExpertSettings(options.settings, tier, selected, sources)) {
    addExpertSettingToRuleset(grouped, setting, tier, sources);
  }
  return {
    version: 1,
    name: `${platformLabel(options.platform)} expert baseline tier ${String(tier)}`,
    policies: [...grouped.entries()].map(([name, group]) => ({
      platform: options.platform,
      name,
      ...(group.description === undefined ? {} : { description: group.description }),
      rules: group.rules,
    })),
  };
}

function selectedExpertSettings(
  settings: readonly BaselineExpertSetting[],
  tier: BaselineTemplateTier,
  selected: ReadonlySet<string>,
  sources: readonly string[],
): readonly BaselineExpertSetting[] {
  return settings.filter((setting) => selected.has(setting.id)
    && setting.requiredInTiers.includes(tier)
    && settingMatchesSources(setting, sources, tier));
}

function addExpertSettingToRuleset(
  grouped: Map<string, ExpertPolicyGroup>,
  setting: BaselineExpertSetting,
  tier: BaselineTemplateTier,
  sources: readonly string[],
): void {
  const mappings = effectiveMappings(setting, tier);
  const recommendations = effectiveRecommendations(setting, tier).filter((recommendation) => sources.includes(recommendation.source));
  if (mappings.length === 0 || recommendations.length === 0) return;
  const tierMapping = effectiveTierMapping(setting, tier);
  const policyName = tierMapping?.policyName ?? setting.policyName;
  const description = tierMapping?.policyDescription ?? setting.policyDescription;
  const group = grouped.get(policyName) ?? { ...(description === undefined ? {} : { description }), rules: [] };
  group.rules = [...group.rules, {
    id: tierMapping?.ruleId ?? setting.ruleId,
    title: tierMapping?.ruleTitle ?? setting.ruleTitle,
    informational: false,
    ...optionalReason(tierMapping?.reason ?? setting.reason),
    sourceRules: recommendations.map((recommendation) => ({ source: recommendation.source, ruleId: recommendation.ruleId, title: recommendation.title })),
    mappings: mappings.map(({ target: _target, ...mapping }) => mapping),
  }];
  grouped.set(policyName, group);
}

function optionalReason(reason: string | undefined): { readonly reason?: string } {
  return reason === undefined ? {} : { reason };
}

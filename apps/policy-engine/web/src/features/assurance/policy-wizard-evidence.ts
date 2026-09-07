/** Selects the effective baseline mappings and recommendation evidence for a tier. */
import type {
  BaselineExpertMapping,
  BaselineExpertSetting,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";

export function effectiveMappings(setting: BaselineExpertSetting, tier: BaselineTemplateTier): readonly BaselineExpertMapping[] {
  return effectiveTierMapping(setting, tier)?.mappings ?? [];
}

export function effectiveTierMapping(setting: BaselineExpertSetting, tier: BaselineTemplateTier): BaselineExpertSetting["tierMappings"][number] | undefined {
  return setting.tierMappings.find((entry) => entry.tier === tier);
}

export function effectiveRecommendations(setting: BaselineExpertSetting, tier: BaselineTemplateTier): BaselineExpertSetting["recommendations"] {
  return effectiveTierMapping(setting, tier)?.recommendations ?? setting.recommendations;
}

export function moduleNamesForTier(settings: readonly BaselineExpertSetting[], tier: BaselineTemplateTier, sources: readonly string[]): readonly string[] {
  return [...new Set(settings
    .filter((setting) => setting.requiredInTiers.includes(tier) && settingMatchesSources(setting, sources, tier))
    .map((setting) => effectiveTierMapping(setting, tier)?.policyName ?? setting.policyName))];
}

export function settingMatchesSources(setting: BaselineExpertSetting, sources: readonly string[], tier: BaselineTemplateTier): boolean {
  return sources.length > 0 && effectiveRecommendations(setting, tier).some((recommendation) => sources.includes(recommendation.source));
}

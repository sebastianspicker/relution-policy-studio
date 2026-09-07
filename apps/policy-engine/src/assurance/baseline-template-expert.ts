/** Builds and normalizes the tier-aware expert selection view. */
import {
  BASELINE_TEMPLATE_TIERS,
  type BaselineExpertOptionsResponse,
  type BaselineExpertSetting,
  type BaselineTemplatePolicy,
  type BaselineTemplateRule,
  type BaselineTemplateSelection,
  type BaselineTemplateTier,
} from "./baseline-template-model.js";
import {
  baselineRuleMetadata,
  baselineSettingId,
  createBaselineExpertSetting,
  recommendationsForBaselineRule,
  uniqueBaselineRecommendations,
  type BaselineExpertSettingAccumulator,
} from "./baseline-template-expert-setting.js";
import { loadBaselineTemplate } from "./baseline-template-storage.js";
import { parseBaselineTemplateDocument } from "./baseline-template-validation.js";

export function loadBaselineExpertOptions(selection: Omit<BaselineTemplateSelection, "tier">): BaselineExpertOptionsResponse {
  const settings = new Map<string, BaselineExpertSettingAccumulator>();
  for (const tier of BASELINE_TEMPLATE_TIERS) {
    const document = parseBaselineTemplateDocument(loadBaselineTemplate({ ...selection, tier }), tier);
    accumulateBaselineTierSettings(settings, document.policies, tier);
  }
  const normalizedSettings = normalizeBaselineExpertSettings(settings);
  return {
    version: 1, format: "relution-baseline-expert", platform: selection.platform, shape: selection.shape,
    tiers: [...BASELINE_TEMPLATE_TIERS], settings: normalizedSettings,
    tierCoverage: BASELINE_TEMPLATE_TIERS.map((tier) => ({
      tier, totalSettings: normalizedSettings.filter((setting) => setting.requiredInTiers.includes(tier)).length,
    })),
  };
}

function accumulateBaselineTierSettings(
  settings: Map<string, BaselineExpertSettingAccumulator>,
  policies: readonly BaselineTemplatePolicy[],
  tier: BaselineTemplateTier,
): void {
  for (const policy of policies) for (const rule of policy.rules) {
    if (!rule.informational && rule.mappings.length > 0) accumulateBaselineRuleSetting(settings, policy, rule, tier);
  }
}

function accumulateBaselineRuleSetting(
  settings: Map<string, BaselineExpertSettingAccumulator>,
  policy: BaselineTemplatePolicy,
  rule: BaselineTemplateRule,
  tier: BaselineTemplateTier,
): void {
  const id = baselineSettingId(rule.mappings);
  const recommendations = recommendationsForBaselineRule(rule);
  const setting = settings.get(id) ?? createBaselineExpertSetting(id, policy, rule, recommendations);
  setting.requiredInTiers.push(tier);
  setting.tierMappings.push({ tier, ...baselineRuleMetadata(policy, rule), recommendations, mappings: rule.mappings });
  setting.recommendations = uniqueBaselineRecommendations([...setting.recommendations, ...recommendations]);
  settings.set(id, setting);
}

function normalizeBaselineExpertSettings(settings: Map<string, BaselineExpertSettingAccumulator>): BaselineExpertSetting[] {
  return [...settings.values()].map((setting) => ({
    ...setting,
    requiredInTiers: [...setting.requiredInTiers].sort(),
    tierMappings: [...setting.tierMappings].sort((left, right) => left.tier - right.tier),
    recommendations: uniqueBaselineRecommendations(setting.recommendations),
  })).sort((left, right) => left.policyName.localeCompare(right.policyName) || left.label.localeCompare(right.label));
}

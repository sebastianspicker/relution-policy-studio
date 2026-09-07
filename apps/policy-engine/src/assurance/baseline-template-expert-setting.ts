/** Creates shared metadata for a selectable expert baseline setting. */
import type {
  BaselineExpertMapping,
  BaselineExpertSetting,
  BaselineTemplatePolicy,
  BaselineTemplateRule,
  BaselineTemplateTier,
} from "./baseline-template-model.js";

export interface BaselineExpertSettingAccumulator extends BaselineExpertSetting {
  readonly requiredInTiers: BaselineTemplateTier[];
  readonly tierMappings: Array<BaselineExpertSetting["tierMappings"][number]>;
  recommendations: BaselineExpertSetting["recommendations"];
}

export function uniqueBaselineRecommendations(
  recommendations: BaselineExpertSetting["recommendations"],
): BaselineExpertSetting["recommendations"] {
  const seen = new Set<string>();
  return recommendations.filter((recommendation) => {
    const key = `${recommendation.source}:${recommendation.ruleId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function recommendationsForBaselineRule(rule: BaselineTemplateRule): BaselineExpertSetting["recommendations"] {
  if (rule.sourceRules.length === 0) {
    return [{
      source: "baseline",
      ruleId: rule.id,
      title: rule.title,
      ...(rule.reason === undefined ? {} : { reason: rule.reason }),
      sourceIds: rule.sourceIds,
    }];
  }
  return rule.sourceRules.map((sourceRule) => ({
    source: sourceRule.source,
    ruleId: sourceRule.ruleId,
    title: sourceRule.title,
    ...(rule.reason === undefined ? {} : { reason: rule.reason }),
    sourceIds: rule.sourceIds,
  }));
}

export function baselineSettingId(mappings: readonly BaselineExpertMapping[]): string {
  return mappings.map((mapping) => `${mapping.kind}:${mapping.target}`).join("|");
}

export function createBaselineExpertSetting(
  id: string, policy: BaselineTemplatePolicy, rule: BaselineTemplateRule, recommendations: BaselineExpertSetting["recommendations"],
): BaselineExpertSettingAccumulator {
  return {
    id, label: rule.mappings.length === 1 ? rule.mappings[0]?.target ?? rule.title : rule.title,
    ...baselineRuleMetadata(policy, rule), requiredInTiers: [], tierMappings: [], recommendations,
  };
}

export function baselineRuleMetadata(policy: BaselineTemplatePolicy, rule: BaselineTemplateRule): Pick<BaselineExpertSetting, "policyName" | "policyDescription" | "ruleId" | "ruleTitle" | "reason"> {
  return {
    policyName: policy.name, ...(policy.description === undefined ? {} : { policyDescription: policy.description }),
    ruleId: rule.id, ruleTitle: rule.title, ...(rule.reason === undefined ? {} : { reason: rule.reason }),
  };
}

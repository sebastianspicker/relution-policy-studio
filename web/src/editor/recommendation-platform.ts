import type { RecommendationRuleset, RecommendationSourceSummary } from "../../../src/recommendation-types.js";
import type { WorkspacePolicy } from "../../../src/workspace.js";

export const ALL_RECOMMENDATION_PLATFORMS = "ALL";

/**
 * Returns the recommendation display platform, not necessarily the Relution
 * import platform. Callers importing rulesets must map the selected display
 * platform through the catalog's displayToImportPlatform contract first.
 */
export function preferredRecommendationPlatform(
  summary: RecommendationSourceSummary,
  currentPolicyPlatform: string | undefined,
): string | undefined {
  if (currentPolicyPlatform === undefined) {
    return undefined;
  }
  if (summary.displayPlatforms.includes(currentPolicyPlatform)) {
    return currentPolicyPlatform;
  }
  if (currentPolicyPlatform === "ANDROID_ENTERPRISE" && summary.displayPlatforms.includes("ANDROID")) {
    return "ANDROID";
  }
  return undefined;
}

export function policyPlatform(policy: WorkspacePolicy | undefined): string | undefined {
  return typeof policy?.document.platform === "string" ? policy.document.platform : undefined;
}

export function filterRecommendationRuleset(ruleset: RecommendationRuleset, platform: string | undefined): RecommendationRuleset {
  if (platform === undefined) {
    return ruleset;
  }
  return {
    ...ruleset,
    policies: ruleset.policies.filter((policy) => policy.platform === platform),
  };
}

export function filterActionableRecommendationRuleset(ruleset: RecommendationRuleset, platform: string | undefined): RecommendationRuleset {
  const platformFiltered = filterRecommendationRuleset(ruleset, platform);
  return {
    ...platformFiltered,
    policies: platformFiltered.policies
      .map((policy) => ({
        ...policy,
        rules: policy.rules.filter((rule) => rule.informational !== true && (rule.mappings?.length ?? 0) > 0),
      }))
      .filter((policy) => policy.rules.length > 0),
  };
}

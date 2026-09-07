/** Maps catalog entries into sorted client-facing baseline options. */
import {
  BASELINE_TEMPLATE_PLATFORMS,
  BASELINE_TEMPLATE_SHAPES,
  fallbackSecurityLevel,
  fallbackTierLabel,
  TIER_STAKEHOLDER_EXAMPLES,
  type BaselineTemplateOption,
  type BaselineTemplateShape,
  type TemplateIndexEntry,
} from "./baseline-template-model.js";

export function optionFromBaselineTemplateEntry(entry: TemplateIndexEntry, shape: BaselineTemplateShape): BaselineTemplateOption {
  return {
    platform: entry.platform,
    tier: entry.tier,
    shape,
    tierLabel: entry.tierLabel ?? fallbackTierLabel(entry.tier),
    securityLevel: entry.securityLevel ?? fallbackSecurityLevel(entry.tier),
    sourcePolicy: entry.tierSourcePolicy ?? "bsi-cis-vendor",
    coverage: entry.tierCoverage ?? "distinct",
    policyCount: entry.policyCount,
    ruleCount: entry.ruleCount,
    actionableRuleCount: entry.actionableRuleCount,
    informationalRuleCount: entry.informationalRuleCount,
    suppressedConflictRuleCount: entry.suppressedConflictRuleCount ?? 0,
    stakeholderExamples: TIER_STAKEHOLDER_EXAMPLES[entry.tier],
  };
}

export function compareBaselineTemplateOptions(left: BaselineTemplateOption, right: BaselineTemplateOption): number {
  const platform = BASELINE_TEMPLATE_PLATFORMS.indexOf(left.platform) - BASELINE_TEMPLATE_PLATFORMS.indexOf(right.platform);
  if (platform !== 0) return platform;
  const tier = left.tier - right.tier;
  if (tier !== 0) return tier;
  return BASELINE_TEMPLATE_SHAPES.indexOf(left.shape) - BASELINE_TEMPLATE_SHAPES.indexOf(right.shape);
}

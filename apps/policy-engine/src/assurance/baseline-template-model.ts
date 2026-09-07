/** Domain model shared by curated baseline template storage and expert views. */

export const BASELINE_TEMPLATE_PLATFORMS = ["WINDOWS", "MACOS", "IOS", "ANDROID_ENTERPRISE"] as const;
export const BASELINE_TEMPLATE_TIERS = [1, 2, 3] as const;
export const BASELINE_TEMPLATE_SHAPES = ["modules", "full"] as const;

export type BaselineTemplatePlatform = (typeof BASELINE_TEMPLATE_PLATFORMS)[number];
export type BaselineTemplateTier = (typeof BASELINE_TEMPLATE_TIERS)[number];
export type BaselineTemplateShape = (typeof BASELINE_TEMPLATE_SHAPES)[number];

export interface BaselineTemplateSelection {
  readonly platform: BaselineTemplatePlatform;
  readonly tier: BaselineTemplateTier;
  readonly shape: BaselineTemplateShape;
}

export interface BaselineTemplateOption extends BaselineTemplateSelection {
  readonly tierLabel: string;
  readonly securityLevel: string;
  readonly sourcePolicy: string;
  readonly coverage: string;
  readonly policyCount: number;
  readonly ruleCount: number;
  readonly actionableRuleCount: number;
  readonly informationalRuleCount: number;
  readonly suppressedConflictRuleCount: number;
  readonly stakeholderExamples: readonly string[];
}

export interface BaselineTemplateOptionsResponse {
  readonly version: number;
  readonly format: string;
  readonly platforms: readonly BaselineTemplatePlatform[];
  readonly shapes: readonly BaselineTemplateShape[];
  readonly tiers: readonly BaselineTemplateTier[];
  readonly options: readonly BaselineTemplateOption[];
}

interface BaselineExpertRecommendation {
  readonly source: string;
  readonly ruleId: string;
  readonly title: string;
  readonly reason?: string;
  readonly sourceIds: readonly string[];
}

export interface BaselineExpertMapping {
  readonly kind: string;
  readonly target: string;
  readonly type?: string;
  readonly payloadType?: string;
  readonly schemaId?: string;
  readonly values: Record<string, unknown>;
}

interface BaselineExpertTierMapping {
  readonly tier: BaselineTemplateTier;
  readonly policyName?: string;
  readonly policyDescription?: string;
  readonly ruleId?: string;
  readonly ruleTitle?: string;
  readonly reason?: string;
  readonly recommendations?: readonly BaselineExpertRecommendation[];
  readonly mappings: readonly BaselineExpertMapping[];
}

export interface BaselineExpertSetting {
  readonly id: string;
  readonly label: string;
  readonly policyName: string;
  readonly policyDescription?: string;
  readonly ruleId: string;
  readonly ruleTitle: string;
  readonly reason?: string;
  readonly requiredInTiers: readonly BaselineTemplateTier[];
  readonly tierMappings: readonly BaselineExpertTierMapping[];
  readonly recommendations: readonly BaselineExpertRecommendation[];
}

interface BaselineExpertTierCoverage {
  readonly tier: BaselineTemplateTier;
  readonly totalSettings: number;
}

export interface BaselineExpertOptionsResponse {
  readonly version: number;
  readonly format: string;
  readonly platform: BaselineTemplatePlatform;
  readonly shape: BaselineTemplateShape;
  readonly tiers: readonly BaselineTemplateTier[];
  readonly settings: readonly BaselineExpertSetting[];
  readonly tierCoverage: readonly BaselineExpertTierCoverage[];
}

export interface TemplateIndex {
  readonly version: number;
  readonly format: string;
  readonly tieredConsolidatedTemplates: readonly TemplateIndexEntry[];
  readonly tieredModularBundleTemplates: readonly TemplateIndexEntry[];
}

export interface TemplateIndexEntry {
  readonly path: string;
  readonly platform: BaselineTemplatePlatform;
  readonly tier: BaselineTemplateTier;
  readonly tierLabel?: string;
  readonly securityLevel?: string;
  readonly tierSourcePolicy?: string;
  readonly tierCoverage?: string;
  readonly policyCount: number;
  readonly ruleCount: number;
  readonly actionableRuleCount: number;
  readonly informationalRuleCount: number;
  readonly suppressedConflictRuleCount?: number;
}

export interface BaselineTemplateDocument {
  readonly version: number;
  readonly name: string;
  readonly policies: readonly BaselineTemplatePolicy[];
}

export interface BaselineTemplatePolicy {
  readonly platform: BaselineTemplatePlatform;
  readonly name: string;
  readonly description?: string;
  readonly rules: readonly BaselineTemplateRule[];
}

export interface BaselineTemplateRule {
  readonly id: string;
  readonly title: string;
  readonly informational: boolean;
  readonly reason?: string;
  readonly sourceIds: readonly string[];
  readonly sourceRules: readonly BaselineTemplateSourceRule[];
  readonly mappings: readonly BaselineExpertMapping[];
}

export interface BaselineTemplateSourceRule {
  readonly source: string;
  readonly ruleId: string;
  readonly title: string;
}

export const TIER_STAKEHOLDER_EXAMPLES: Record<BaselineTemplateTier, readonly string[]> = {
  1: ["Administration", "Finance/HR", "Exam devices", "Sensitive research devices"],
  2: ["Staff devices", "Faculty devices", "Institute-owned devices", "Regular administrative workflows"],
  3: ["Classroom devices", "Shared devices", "Student devices", "Low-risk managed devices"],
};

const TIER_DEFAULTS: Record<BaselineTemplateTier, { readonly label: string; readonly securityLevel: string }> = {
  1: { label: "Tier 1 - most restrictive Grundschutz baseline", securityLevel: "grundschutz" },
  2: { label: "Tier 2 - strengthened BSI baseline", securityLevel: "standard-hardening" },
  3: { label: "Tier 3 - minimum secure BSI Basis baseline", securityLevel: "basis" },
};

export function fallbackTierLabel(tier: BaselineTemplateTier): string {
  return TIER_DEFAULTS[tier].label;
}

export function fallbackSecurityLevel(tier: BaselineTemplateTier): string {
  return TIER_DEFAULTS[tier].securityLevel;
}

export function isBaselineTemplatePlatform(value: string): value is BaselineTemplatePlatform {
  return BASELINE_TEMPLATE_PLATFORMS.includes(value as BaselineTemplatePlatform);
}

export function isBaselineTemplateTier(value: number): value is BaselineTemplateTier {
  return BASELINE_TEMPLATE_TIERS.includes(value as BaselineTemplateTier);
}

export function isBaselineTemplateShape(value: string): value is BaselineTemplateShape {
  return BASELINE_TEMPLATE_SHAPES.includes(value as BaselineTemplateShape);
}

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

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

export interface BaselineExpertRecommendation {
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

export interface BaselineExpertTierMapping {
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

export interface BaselineExpertTierCoverage {
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

interface TemplateIndex {
  readonly version: number;
  readonly format: string;
  readonly tieredConsolidatedTemplates: readonly TemplateIndexEntry[];
  readonly tieredModularBundleTemplates: readonly TemplateIndexEntry[];
}

interface TemplateIndexEntry {
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

interface BaselineTemplateDocument {
  readonly version: number;
  readonly name: string;
  readonly policies: readonly BaselineTemplatePolicy[];
}

interface BaselineTemplatePolicy {
  readonly platform: BaselineTemplatePlatform;
  readonly name: string;
  readonly description?: string;
  readonly rules: readonly BaselineTemplateRule[];
}

interface BaselineTemplateRule {
  readonly id: string;
  readonly title: string;
  readonly informational: boolean;
  readonly reason?: string;
  readonly sourceIds: readonly string[];
  readonly sourceRules: readonly BaselineTemplateSourceRule[];
  readonly mappings: readonly BaselineExpertMapping[];
}

interface BaselineTemplateSourceRule {
  readonly source: string;
  readonly ruleId: string;
  readonly title: string;
}

const INDEX_PATH = resolve("example/relution-baseline-templates/index.json");
const TEMPLATE_ROOT = resolve("example/relution-baseline-templates");

const TIER_STAKEHOLDER_EXAMPLES: Record<BaselineTemplateTier, readonly string[]> = {
  1: ["Administration", "Finance/HR", "Exam devices", "Sensitive research devices"],
  2: ["Staff devices", "Faculty devices", "Institute-owned devices", "Regular administrative workflows"],
  3: ["Classroom devices", "Shared devices", "Student devices", "Low-risk managed devices"],
};

export function parseBaselineTemplatePlatform(value: string | null): BaselineTemplatePlatform {
  if (value !== null && isBaselineTemplatePlatform(value)) {
    return value;
  }
  throw new Error(`Unknown baseline template platform: ${String(value)}`);
}

export function parseBaselineTemplateTier(value: string | null): BaselineTemplateTier {
  const parsed = Number(value);
  if (isBaselineTemplateTier(parsed)) {
    return parsed;
  }
  throw new Error(`Unknown baseline template tier: ${String(value)}`);
}

export function parseBaselineTemplateShape(value: string | null): BaselineTemplateShape {
  if (value !== null && isBaselineTemplateShape(value)) {
    return value;
  }
  throw new Error(`Unknown baseline template shape: ${String(value)}`);
}

export function listBaselineTemplateOptions(): BaselineTemplateOptionsResponse {
  const index = loadTemplateIndex();
  return {
    version: index.version,
    format: index.format,
    platforms: [...BASELINE_TEMPLATE_PLATFORMS],
    shapes: [...BASELINE_TEMPLATE_SHAPES],
    tiers: [...BASELINE_TEMPLATE_TIERS],
    options: [
      ...index.tieredModularBundleTemplates.map((entry) => optionFromEntry(entry, "modules")),
      ...index.tieredConsolidatedTemplates.map((entry) => optionFromEntry(entry, "full")),
    ].sort(compareOptions),
  };
}

export function loadBaselineTemplate(selection: BaselineTemplateSelection): unknown {
  const entry = findTemplateEntry(loadTemplateIndex(), selection);
  const file = safeTemplatePath(entry.path);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

export function loadBaselineExpertOptions(selection: Omit<BaselineTemplateSelection, "tier">): BaselineExpertOptionsResponse {
  const documents = new Map(BASELINE_TEMPLATE_TIERS.map((tier) => [
    tier,
    parseBaselineTemplateDocument(loadBaselineTemplate({ ...selection, tier }), tier),
  ]));
  const settings = new Map<string, BaselineExpertSettingAccumulator>();
  for (const tier of BASELINE_TEMPLATE_TIERS) {
    const document = documents.get(tier);
    if (document === undefined) {
      continue;
    }
    for (const policy of document.policies) {
      for (const rule of policy.rules) {
        if (rule.informational || rule.mappings.length === 0) {
          continue;
        }
        const id = settingId(rule.mappings);
        const existing = settings.get(id);
        const accumulator = existing ?? {
          id,
          label: settingLabel(rule, rule.mappings),
          policyName: policy.name,
          ...(policy.description === undefined ? {} : { policyDescription: policy.description }),
          ruleId: rule.id,
          ruleTitle: rule.title,
          ...(rule.reason === undefined ? {} : { reason: rule.reason }),
          requiredInTiers: [],
          tierMappings: [],
          recommendations: recommendationsForRule(rule),
        };
        const tierRecommendations = recommendationsForRule(rule);
        accumulator.requiredInTiers.push(tier);
        accumulator.tierMappings.push({
          tier,
          policyName: policy.name,
          ...(policy.description === undefined ? {} : { policyDescription: policy.description }),
          ruleId: rule.id,
          ruleTitle: rule.title,
          ...(rule.reason === undefined ? {} : { reason: rule.reason }),
          recommendations: tierRecommendations,
          mappings: rule.mappings,
        });
        accumulator.recommendations = uniqueRecommendations([...accumulator.recommendations, ...tierRecommendations]);
        settings.set(id, accumulator);
      }
    }
  }
  const normalizedSettings = [...settings.values()].map((setting) => ({
    ...setting,
    requiredInTiers: [...setting.requiredInTiers].sort(),
    tierMappings: [...setting.tierMappings].sort((left, right) => left.tier - right.tier),
    recommendations: uniqueRecommendations(setting.recommendations),
  })).sort((left, right) => left.policyName.localeCompare(right.policyName) || left.label.localeCompare(right.label));
  return {
    version: 1,
    format: "relution-baseline-expert",
    platform: selection.platform,
    shape: selection.shape,
    tiers: [...BASELINE_TEMPLATE_TIERS],
    settings: normalizedSettings,
    tierCoverage: BASELINE_TEMPLATE_TIERS.map((tier) => ({
      tier,
      totalSettings: normalizedSettings.filter((setting) => setting.requiredInTiers.includes(tier)).length,
    })),
  };
}

interface BaselineExpertSettingAccumulator {
  readonly id: string;
  readonly label: string;
  readonly policyName: string;
  readonly policyDescription?: string;
  readonly ruleId: string;
  readonly ruleTitle: string;
  readonly reason?: string;
  readonly requiredInTiers: BaselineTemplateTier[];
  readonly tierMappings: BaselineExpertTierMapping[];
  recommendations: readonly BaselineExpertRecommendation[];
}

function parseBaselineTemplateDocument(input: unknown, tier: BaselineTemplateTier): BaselineTemplateDocument {
  const record = requireRecord(input, `tier ${String(tier)} baseline template`);
  const policies = record.policies;
  if (!Array.isArray(policies)) {
    throw new Error(`Expected policies array in tier ${String(tier)} baseline template`);
  }
  return {
    version: requireNumber(record, "version"),
    name: requireString(record, "name"),
    policies: policies.map((policy, index) => parseBaselineTemplatePolicy(policy, `${String(tier)}.${String(index + 1)}`)),
  };
}

function parseBaselineTemplatePolicy(input: unknown, label: string): BaselineTemplatePolicy {
  const record = requireRecord(input, `baseline policy ${label}`);
  const platform = requireString(record, "platform");
  const rules = record.rules;
  if (!isBaselineTemplatePlatform(platform)) {
    throw new Error(`Invalid baseline policy platform: ${platform}`);
  }
  if (!Array.isArray(rules)) {
    throw new Error(`Expected rules array in baseline policy ${label}`);
  }
  const description = optionalString(record, "description");
  return {
    platform,
    name: requireString(record, "name"),
    ...(description === undefined ? {} : { description }),
    rules: rules.map((rule, index) => parseBaselineTemplateRule(rule, `${label}.${String(index + 1)}`)),
  };
}

function parseBaselineTemplateRule(input: unknown, label: string): BaselineTemplateRule {
  const record = requireRecord(input, `baseline rule ${label}`);
  const sourceIds = record.sourceIds;
  const sourceRules = record.sourceRules;
  const mappings = record.mappings;
  const reason = optionalString(record, "reason");
  return {
    id: requireString(record, "id"),
    title: requireString(record, "title"),
    informational: record.informational === true,
    ...(reason === undefined ? {} : { reason }),
    sourceIds: Array.isArray(sourceIds) ? sourceIds.filter((entry): entry is string => typeof entry === "string") : [],
    sourceRules: Array.isArray(sourceRules) ? sourceRules.map((entry, index) => parseSourceRule(entry, `${label}.${String(index + 1)}`)) : [],
    mappings: Array.isArray(mappings) ? mappings.map((entry, index) => parseExpertMapping(entry, `${label}.${String(index + 1)}`)) : [],
  };
}

function parseSourceRule(input: unknown, label: string): BaselineTemplateSourceRule {
  const record = requireRecord(input, `source rule ${label}`);
  return {
    source: requireString(record, "source"),
    ruleId: requireString(record, "ruleId"),
    title: requireString(record, "title"),
  };
}

function parseExpertMapping(input: unknown, label: string): BaselineExpertMapping {
  const record = requireRecord(input, `expert mapping ${label}`);
  const kind = requireString(record, "kind");
  const type = optionalString(record, "type");
  const payloadType = optionalString(record, "payloadType");
  const schemaId = optionalString(record, "schemaId");
  const values = optionalRecord(record, "values") ?? {};
  return {
    kind,
    target: mappingTarget(kind, type, payloadType, schemaId),
    ...(type === undefined ? {} : { type }),
    ...(payloadType === undefined ? {} : { payloadType }),
    ...(schemaId === undefined ? {} : { schemaId }),
    values,
  };
}

function settingId(mappings: readonly BaselineExpertMapping[]): string {
  return mappings.map((mapping) => `${mapping.kind}:${mapping.target}`).join("|");
}

function settingLabel(rule: BaselineTemplateRule, mappings: readonly BaselineExpertMapping[]): string {
  return mappings.length === 1 ? mappings[0]?.target ?? rule.title : rule.title;
}

function recommendationsForRule(rule: BaselineTemplateRule): readonly BaselineExpertRecommendation[] {
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

function uniqueRecommendations(recommendations: readonly BaselineExpertRecommendation[]): readonly BaselineExpertRecommendation[] {
  const seen = new Set<string>();
  return recommendations.filter((recommendation) => {
    const key = `${recommendation.source}:${recommendation.ruleId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mappingTarget(kind: string, type: string | undefined, payloadType: string | undefined, schemaId: string | undefined): string {
  if (kind === "relution-native" && type !== undefined) {
    return type;
  }
  if (kind === "apple-mobileconfig" && payloadType !== undefined) {
    return payloadType;
  }
  if (kind === "apple-schema-profile" && schemaId !== undefined) {
    return schemaId;
  }
  throw new Error(`Mapping has invalid fields for kind ${kind}`);
}

function loadTemplateIndex(): TemplateIndex {
  const parsed = JSON.parse(readFileSync(INDEX_PATH, "utf8")) as unknown;
  const record = requireRecord(parsed, "baseline template index");
  return {
    version: requireNumber(record, "version"),
    format: requireString(record, "format"),
    tieredConsolidatedTemplates: requireEntries(record, "tieredConsolidatedTemplates"),
    tieredModularBundleTemplates: requireEntries(record, "tieredModularBundleTemplates"),
  };
}

function requireEntries(record: Record<string, unknown>, key: string): TemplateIndexEntry[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${key} array in baseline template index`);
  }
  return value.map((entry, index) => normalizeEntry(entry, `${key}[${String(index)}]`));
}

function normalizeEntry(value: unknown, label: string): TemplateIndexEntry {
  const record = requireRecord(value, label);
  const tier = requireNumber(record, "tier");
  const platform = requireString(record, "platform");
  if (!isBaselineTemplateTier(tier)) {
    throw new Error(`Invalid tier in ${label}: ${String(tier)}`);
  }
  if (!isBaselineTemplatePlatform(platform)) {
    throw new Error(`Invalid platform in ${label}: ${platform}`);
  }
  const tierLabel = optionalString(record, "tierLabel");
  const securityLevel = optionalString(record, "securityLevel");
  const tierSourcePolicy = optionalString(record, "tierSourcePolicy");
  const tierCoverage = optionalString(record, "tierCoverage");
  const suppressedConflictRuleCount = optionalNumber(record, "suppressedConflictRuleCount");
  return {
    path: requireString(record, "path"),
    platform,
    tier,
    policyCount: requireNumber(record, "policyCount"),
    ruleCount: requireNumber(record, "ruleCount"),
    actionableRuleCount: requireNumber(record, "actionableRuleCount"),
    informationalRuleCount: requireNumber(record, "informationalRuleCount"),
    ...(tierLabel === undefined ? {} : { tierLabel }),
    ...(securityLevel === undefined ? {} : { securityLevel }),
    ...(tierSourcePolicy === undefined ? {} : { tierSourcePolicy }),
    ...(tierCoverage === undefined ? {} : { tierCoverage }),
    ...(suppressedConflictRuleCount === undefined ? {} : { suppressedConflictRuleCount }),
  };
}

function optionFromEntry(entry: TemplateIndexEntry, shape: BaselineTemplateShape): BaselineTemplateOption {
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

function findTemplateEntry(index: TemplateIndex, selection: BaselineTemplateSelection): TemplateIndexEntry {
  const entries = selection.shape === "modules" ? index.tieredModularBundleTemplates : index.tieredConsolidatedTemplates;
  const entry = entries.find((candidate) => candidate.platform === selection.platform && candidate.tier === selection.tier);
  if (entry === undefined) {
    throw new Error(`Baseline template is not available: ${selection.platform} tier ${String(selection.tier)} ${selection.shape}`);
  }
  return entry;
}

function safeTemplatePath(indexPath: string): string {
  const file = resolve(indexPath);
  if (!existsSync(file)) {
    throw new Error(`Baseline template file does not exist: ${indexPath}`);
  }
  const realRoot = realpathSync(TEMPLATE_ROOT);
  const realFile = realpathSync(file);
  if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${sep}`)) {
    throw new Error(`Baseline template path escapes template root: ${indexPath}`);
  }
  return file;
}

function compareOptions(left: BaselineTemplateOption, right: BaselineTemplateOption): number {
  const platform = BASELINE_TEMPLATE_PLATFORMS.indexOf(left.platform) - BASELINE_TEMPLATE_PLATFORMS.indexOf(right.platform);
  if (platform !== 0) {
    return platform;
  }
  const tier = left.tier - right.tier;
  if (tier !== 0) {
    return tier;
  }
  return BASELINE_TEMPLATE_SHAPES.indexOf(left.shape) - BASELINE_TEMPLATE_SHAPES.indexOf(right.shape);
}

const TIER_DEFAULTS: Record<BaselineTemplateTier, { readonly label: string; readonly securityLevel: string }> = {
  1: { label: "Tier 1 - most restrictive Grundschutz baseline", securityLevel: "grundschutz" },
  2: { label: "Tier 2 - strengthened BSI baseline", securityLevel: "standard-hardening" },
  3: { label: "Tier 3 - minimum secure BSI Basis baseline", securityLevel: "basis" },
};

function fallbackTierLabel(tier: BaselineTemplateTier): string {
  return TIER_DEFAULTS[tier].label;
}

function fallbackSecurityLevel(tier: BaselineTemplateTier): string {
  return TIER_DEFAULTS[tier].securityLevel;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected object: ${label}`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected string field: ${key}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function requireNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error(`Expected integer field: ${key}`);
  }
  return value;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new Error(`Expected integer field: ${key}`);
  }
  return value;
}

function isBaselineTemplatePlatform(value: string): value is BaselineTemplatePlatform {
  return isOneOf(BASELINE_TEMPLATE_PLATFORMS, value);
}

function isBaselineTemplateTier(value: number): value is BaselineTemplateTier {
  return isOneOf(BASELINE_TEMPLATE_TIERS, value);
}

function isBaselineTemplateShape(value: string): value is BaselineTemplateShape {
  return isOneOf(BASELINE_TEMPLATE_SHAPES, value);
}

function isOneOf<T>(values: readonly T[], value: unknown): value is T {
  return values.some((entry) => entry === value);
}

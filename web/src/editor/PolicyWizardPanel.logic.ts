import type {
  BaselineExpertMapping,
  BaselineExpertOptionsResponse,
  BaselineExpertSetting,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../../../src/baseline-templates.js";
import { asRecord } from "./editor-utils.js";
import type { BaselineExpertApplyRuleset } from "./baseline-template-client.js";
import type { EditorController, JsonRecord } from "./types.js";

export interface TierCoverage {
  readonly tier: BaselineTemplateTier;
  readonly matched: number;
  readonly total: number;
  readonly percent: number;
}

type ExpertPolicyGroup = {
  description?: string;
  rules: BaselineExpertApplyRuleset["policies"][number]["rules"];
};

export function tierCoverage(settings: readonly BaselineExpertSetting[], selected: ReadonlySet<string>, sources: readonly string[]): TierCoverage[] {
  return ([1, 2, 3] as const).map((tier) => {
    const required = settings.filter((setting) => setting.requiredInTiers.includes(tier) && settingMatchesSources(setting, sources, tier));
    const matched = required.filter((setting) => selected.has(setting.id)).length;
    return { tier, matched, total: required.length, percent: percentage(matched, required.length) };
  });
}

export function tierWorkspaceCoverage(settings: readonly BaselineExpertSetting[], workspace: EditorController["state"]["workspace"], sources: readonly string[]): TierCoverage[] {
  const details = workspace.policies.flatMap((policy) => {
    const versions = Array.isArray(policy.document.versions) ? policy.document.versions : [];
    return versions.flatMap((version) => {
      const configurations = asRecord(version)?.configurations;
      if (!Array.isArray(configurations)) {
        return [];
      }
      return configurations
        .map((configuration: unknown) => asRecord(asRecord(configuration)?.details))
        .filter((entry): entry is JsonRecord => entry !== undefined);
    });
  });
  return ([1, 2, 3] as const).map((tier) => {
    const required = settings.filter((setting) => setting.requiredInTiers.includes(tier) && settingMatchesSources(setting, sources, tier));
    const matched = required.filter((setting) => effectiveMappings(setting, tier).every((mapping) => mappingMatches(details, mapping))).length;
    return { tier, matched, total: required.length, percent: percentage(matched, required.length) };
  });
}

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
  return settings.filter((setting) =>
    selected.has(setting.id)
    && setting.requiredInTiers.includes(tier)
    && settingMatchesSources(setting, sources, tier),
  );
}

function addExpertSettingToRuleset(
  grouped: Map<string, ExpertPolicyGroup>,
  setting: BaselineExpertSetting,
  tier: BaselineTemplateTier,
  sources: readonly string[],
): void {
  const mappings = effectiveMappings(setting, tier);
  const recommendations = effectiveRecommendations(setting, tier).filter((recommendation) => sources.includes(recommendation.source));
  if (mappings.length === 0 || recommendations.length === 0) {
    return;
  }
  const tierMapping = effectiveTierMapping(setting, tier);
  const policyName = tierMapping?.policyName ?? setting.policyName;
  const group = expertPolicyGroup(grouped, policyName, tierMapping?.policyDescription ?? setting.policyDescription);
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

function expertPolicyGroup(grouped: Map<string, ExpertPolicyGroup>, policyName: string, description: string | undefined): ExpertPolicyGroup {
  return grouped.get(policyName) ?? { ...(description === undefined ? {} : { description }), rules: [] };
}

function optionalReason(reason: string | undefined): { readonly reason?: string } {
  return reason === undefined ? {} : { reason };
}

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
    .filter((s) => s.requiredInTiers.includes(tier) && settingMatchesSources(s, sources, tier))
    .map((s) => effectiveTierMapping(s, tier)?.policyName ?? s.policyName))];
}

export function settingMatchesSources(setting: BaselineExpertSetting, sources: readonly string[], tier: BaselineTemplateTier): boolean {
  if (sources.length === 0) return false;
  return effectiveRecommendations(setting, tier).some((r) => sources.includes(r.source));
}

export function presetSettingIds(settings: readonly BaselineExpertSetting[], tier: BaselineTemplateTier, sources: readonly string[]): readonly string[] {
  return settings.filter((setting) => setting.requiredInTiers.includes(tier) && settingMatchesSources(setting, sources, tier)).map((setting) => setting.id);
}

export function toggleSetting(current: readonly string[], id: string, checked: boolean): readonly string[] {
  if (checked) return current.includes(id) ? current : [...current, id];
  return current.filter((entry) => entry !== id);
}

export function expertSettingMatches(setting: BaselineExpertSetting, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return [
    setting.label,
    setting.policyName,
    setting.ruleTitle,
    ...setting.tierMappings.flatMap((entry) => [entry.policyName ?? "", entry.ruleTitle ?? ""]),
    ...setting.recommendations.flatMap((recommendation) => [recommendation.source, recommendation.ruleId, recommendation.title]),
    ...setting.tierMappings.flatMap((entry) => (entry.recommendations ?? []).flatMap((recommendation) => [recommendation.source, recommendation.ruleId, recommendation.title])),
  ].some((value) => value.toLowerCase().includes(normalized));
}

export function formatMappingValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
}

export function sourceLabel(source: string): string {
  if (source === "bsi") return "BSI";
  if (source === "cis") return "CIS";
  if (source === "vendor") return "Vendor";
  return source.toUpperCase();
}

export function platformLabel(platform: BaselineTemplatePlatform): string {
  const labels: Record<BaselineTemplatePlatform, string> = { ANDROID_ENTERPRISE: "Android Enterprise", IOS: "iOS", MACOS: "macOS", WINDOWS: "Windows" };
  return labels[platform];
}

export function shapeLabel(shape: BaselineTemplateShape): string {
  return shape === "modules" ? "Modular policies" : "Single policy";
}

export function tierDescription(tier: BaselineTemplateTier): string {
  const d: Record<BaselineTemplateTier, string> = { 1: "Most restrictive Grundschutz baseline", 2: "Strengthened standard hardening baseline", 3: "Minimum secure BSI Basis baseline" };
  return d[tier];
}

function percentage(matched: number, total: number): number {
  return total === 0 ? 100 : Math.round((matched / total) * 100);
}

function mappingMatches(details: readonly JsonRecord[], mapping: BaselineExpertMapping): boolean {
  return details.some((candidate) => {
    if (mapping.type !== undefined && candidate.type !== mapping.type) return false;
    if (mapping.payloadType !== undefined && candidate.payloadType !== mapping.payloadType) return false;
    if (mapping.schemaId !== undefined && candidate.schemaId !== mapping.schemaId) return false;
    return Object.entries(mapping.values).every(([key, value]) => JSON.stringify(candidate[key]) === JSON.stringify(value));
  });
}

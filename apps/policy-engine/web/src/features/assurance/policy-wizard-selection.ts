/** Manages expert-setting selection and search without UI state. */
import type {
  BaselineExpertSetting,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { settingMatchesSources } from "./policy-wizard-evidence.js";

export function presetSettingIds(settings: readonly BaselineExpertSetting[], tier: BaselineTemplateTier, sources: readonly string[]): readonly string[] {
  return settings
    .filter((setting) => setting.requiredInTiers.includes(tier) && settingMatchesSources(setting, sources, tier))
    .map((setting) => setting.id);
}

export function toggleSetting(current: readonly string[], id: string, checked: boolean): readonly string[] {
  if (checked) return current.includes(id) ? current : [...current, id];
  return current.filter((entry) => entry !== id);
}

export function expertSettingMatches(setting: BaselineExpertSetting, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return normalized.length === 0
    || searchableSettingValues(setting).some((value) => value.toLowerCase().includes(normalized));
}

function searchableSettingValues(setting: BaselineExpertSetting): readonly string[] {
  const values = [setting.label, setting.policyName, setting.ruleTitle];
  for (const recommendation of setting.recommendations) {
    values.push(recommendation.source, recommendation.ruleId, recommendation.title);
  }
  for (const mapping of setting.tierMappings) {
    values.push(mapping.policyName ?? "", mapping.ruleTitle ?? "");
    for (const recommendation of mapping.recommendations ?? []) {
      values.push(recommendation.source, recommendation.ruleId, recommendation.title);
    }
  }
  return values;
}

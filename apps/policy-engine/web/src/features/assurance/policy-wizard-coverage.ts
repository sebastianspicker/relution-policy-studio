/** Measures expert-setting coverage against selected settings and workspace payloads. */
import type {
  BaselineExpertMapping,
  BaselineExpertSetting,
  BaselineTemplateTier,
} from "../../../../src/browser/assurance.js";
import { effectiveMappings, settingMatchesSources } from "./policy-wizard-evidence.js";
import { workspaceConfigurationDetails } from "./policy-wizard-workspace.js";
import type { EditorController, JsonRecord } from "../../shared/editor-contracts.js";

export interface TierCoverage {
  readonly tier: BaselineTemplateTier;
  readonly matched: number;
  readonly total: number;
  readonly percent: number;
}

export function tierCoverage(settings: readonly BaselineExpertSetting[], selected: ReadonlySet<string>, sources: readonly string[]): TierCoverage[] {
  return coverageByTier(settings, sources, (setting) => selected.has(setting.id));
}

export function tierWorkspaceCoverage(settings: readonly BaselineExpertSetting[], workspace: EditorController["state"]["workspace"], sources: readonly string[]): TierCoverage[] {
  const details = workspaceConfigurationDetails(workspace);
  return coverageByTier(settings, sources, (setting, tier) =>
    effectiveMappings(setting, tier).every((mapping) => mappingMatches(details, mapping)),
  );
}

function coverageByTier(
  settings: readonly BaselineExpertSetting[],
  sources: readonly string[],
  isMatched: (setting: BaselineExpertSetting, tier: BaselineTemplateTier) => boolean,
): TierCoverage[] {
  return ([1, 2, 3] as const).map((tier) => tierCoverageFor(settings, sources, tier, isMatched));
}

function tierCoverageFor(
  settings: readonly BaselineExpertSetting[],
  sources: readonly string[],
  tier: BaselineTemplateTier,
  isMatched: (setting: BaselineExpertSetting, tier: BaselineTemplateTier) => boolean,
): TierCoverage {
  const required = settings.filter((setting) =>
    setting.requiredInTiers.includes(tier) && settingMatchesSources(setting, sources, tier),
  );
  const matched = required.filter((setting) => isMatched(setting, tier)).length;
  return { tier, matched, total: required.length, percent: required.length === 0 ? 100 : Math.round((matched / required.length) * 100) };
}

function mappingMatches(details: readonly JsonRecord[], mapping: BaselineExpertMapping): boolean {
  return details.some((candidate) => mappingIdentityMatches(candidate, mapping)
    && Object.entries(mapping.values).every(([key, value]) => JSON.stringify(candidate[key]) === JSON.stringify(value)));
}

function mappingIdentityMatches(candidate: JsonRecord, mapping: BaselineExpertMapping): boolean {
  if (mapping.type !== undefined && candidate.type !== mapping.type) return false;
  if (mapping.payloadType !== undefined && candidate.payloadType !== mapping.payloadType) return false;
  return mapping.schemaId === undefined || candidate.schemaId === mapping.schemaId;
}

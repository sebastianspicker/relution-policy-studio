/** Derives remediation choices from recommendation and platform metadata. */
import type {
  RecommendationImplementation,
  RecommendationRecord,
  RecommendationRulesetMapping,
  RecommendationSettingBundleCatalog,
  RecommendationSource,
} from "./recommendation-types.js";
import type { ComplianceMappingResult, ComplianceRemediationOption } from "./compliance-types.js";
import { matchingNativeBundleOptions } from "./compliance-native-remediation-options.js";

export function remediationOptionsForRecommendation(
  source: RecommendationSource,
  recommendation: RecommendationRecord,
  settingsCatalog: RecommendationSettingBundleCatalog | undefined,
  settingBundleCatalogError: string | undefined,
  mappingResults: ComplianceMappingResult[],
): ComplianceRemediationOption[] {
  if (mappingResults.some((entry) => entry.status === "ambiguous")) {
    return [];
  }
  if (settingsCatalog === undefined && mappingResults.some((entry) => entry.kind === "relution-native")) {
    const reason = settingBundleCatalogError === undefined
      ? "Setting bundle catalog failed to load"
      : `Setting bundle catalog failed to load: ${settingBundleCatalogError}`;
    return [{ ...recommendationOption(source, recommendation), available: false, unavailableReason: reason }];
  }

  return matchingNativeBundleOptions(recommendation.id, settingsCatalog)
    ?? [recommendationOption(source, recommendation)];
}

function recommendationOption(source: RecommendationSource, recommendation: RecommendationRecord): ComplianceRemediationOption {
  return {
    id: `recommendation:${source}:${recommendation.id}`,
    kind: "exact-recommendation",
    label: `Apply exact mapping for ${recommendation.title}`,
    surfaces: recommendationImplementationOf(recommendation).surfaces,
    coveredRecommendationIds: [recommendation.id],
    ...mappingTargetMetadata(recommendation.relutionMapping.rulesetMappings[0]),
  };
}

function mappingTargetMetadata(mapping: RecommendationRulesetMapping | undefined): Pick<ComplianceRemediationOption, "schemaId" | "payloadType"> {
  if (mapping?.kind === "apple-schema-profile" && typeof mapping.schemaId === "string") {
    return { schemaId: mapping.schemaId };
  }
  if (mapping?.kind === "apple-mobileconfig" && typeof mapping.payloadType === "string") {
    return { payloadType: mapping.payloadType };
  }
  return {};
}

export function recommendationImplementationOf(recommendation: RecommendationRecord): RecommendationImplementation {
  if (recommendation.implementation === undefined) {
    throw new Error(`Recommendation ${recommendation.id} is missing the 'implementation' field.`);
  }
  return recommendation.implementation;
}

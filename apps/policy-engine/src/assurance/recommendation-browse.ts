/** Projects cached catalog evidence into compact, searchable browse rows. */
import type { RecommendationBrowseResponse, RecommendationCatalogResponse, RecommendationRecord, RecommendationSource } from "./recommendation-types.js";
import { implementationOf } from "./recommendation-implementation.js";

const browseCache = new WeakMap<RecommendationCatalogResponse, RecommendationBrowseResponse>();

export function browseRecommendationCatalog(catalog: RecommendationCatalogResponse): RecommendationBrowseResponse {
  const cached = browseCache.get(catalog);
  if (cached !== undefined) return cached;
  const { recommendations, ruleset, ...summary } = catalog;
  const browse = {
    ...summary,
    actionableImportPlatforms: [...new Set(ruleset?.policies.filter((policy) => policy.rules.some((rule) => rule.informational !== true && (rule.mappings?.length ?? 0) > 0)).map((policy) => policy.platform) ?? [])],
    recommendations: recommendations.map((record) => ({
      id: record.id, platform: record.platform, title: record.title,
      displayIdentifier: displayIdentifier(record, catalog.source), searchTerms: searchTerms(record, catalog.source),
      relutionMapping: { status: record.relutionMapping.status },
      implementation: browseImplementation(record),
      hasRulesetMappings: record.relutionMapping.rulesetMappings.length > 0,
    })),
  };
  browseCache.set(catalog, browse);
  return browse;
}

function displayIdentifier(record: RecommendationRecord, source: RecommendationSource): string {
  if (source === "bsi" && "requirementId" in record) return record.requirementId;
  if (source === "cis" && "recommendationId" in record) return record.recommendationId;
  return "section" in record ? record.section : record.id;
}

function searchTerms(record: RecommendationRecord, source: RecommendationSource): string[] {
  const terms = [record.title, record.platform, displayIdentifier(record, source)];
  if (source === "bsi" && "moduleId" in record) terms.push(record.moduleId, record.moduleTitle, ...(record.semanticConcepts ?? []).flatMap((concept) => [concept.id, concept.label.de, concept.label.en, concept.matchedTerms.join(" ")]));
  if (source === "cis" && "benchmarkTitle" in record) terms.push(record.benchmarkTitle, record.benchmarkVersion);
  if (source === "vendor" && "section" in record) terms.push(record.section, record.reason);
  return terms;
}

function browseImplementation(record: RecommendationRecord): RecommendationBrowseResponse["recommendations"][number]["implementation"] {
  const { category, surfaces, importableVia } = implementationOf(record);
  return { category, surfaces, importableVia };
}

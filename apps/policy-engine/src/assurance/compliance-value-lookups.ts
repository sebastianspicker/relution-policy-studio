/** Resolves setting bundles and canonical configuration references. */
import type {
  RecommendationSettingBundle,
  RecommendationSettingBundleCatalog,
} from "./recommendation-types.js";
import type { ComplianceConfigurationReference } from "./compliance-types.js";

export function findSettingBundle(
  catalog: RecommendationSettingBundleCatalog | undefined,
  bundleId: string | undefined,
): RecommendationSettingBundle | undefined {
  if (catalog === undefined || bundleId === undefined) return undefined;
  return catalog.bundles.find((bundle) => bundle.bundleId === bundleId);
}

export function uniqueConfigurationReferences(references: ComplianceConfigurationReference[]): ComplianceConfigurationReference[] {
  const byIndex = new Map<number, ComplianceConfigurationReference>();
  for (const reference of references) byIndex.set(reference.configurationIndex, reference);
  return [...byIndex.values()].sort((left, right) => left.configurationIndex - right.configurationIndex);
}

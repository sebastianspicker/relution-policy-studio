/** Resolves exact native-bundle remediation variants for one recommendation. */
import type { ComplianceRemediationOption } from "./compliance-types.js";
import type { RecommendationSettingBundle, RecommendationSettingBundleCatalog } from "./recommendation-types.js";

export function matchingNativeBundleOptions(
  recommendationId: string,
  settingsCatalog: RecommendationSettingBundleCatalog | undefined,
): ComplianceRemediationOption[] | undefined {
  const bundles = settingsCatalog?.bundles.filter((bundle) => bundle.derivedFromRecommendationIds.includes(recommendationId)) ?? [];
  if (bundles.length === 0) return undefined;
  const bundleById = new Map(bundles.map((bundle) => [bundle.bundleId, bundle]));
  const variantGroup = settingsCatalog?.variantGroups.find(
    (group) => group.variants.some((variant) => bundleById.has(variant.bundleId)),
  );
  if (variantGroup === undefined) return bundles.map((bundle) => nativeBundleOption(bundle, bundle.variantId));
  return variantGroup.variants
    .map((variant) => bundleById.get(variant.bundleId))
    .filter((bundle): bundle is RecommendationSettingBundle => bundle !== undefined)
    .map((bundle) => nativeBundleOption(bundle, bundle.variantId));
}

function nativeBundleOption(
  bundle: RecommendationSettingBundle,
  variantId: string | undefined,
): ComplianceRemediationOption {
  return {
    id: `native-bundle:${bundle.bundleId}`,
    kind: "native-bundle",
    label: variantId === undefined
      ? `Apply ${bundle.targetType} exact bundle`
      : `Apply ${bundle.targetType} exact bundle (${variantId})`,
    surfaces: ["relution-native"],
    coveredRecommendationIds: bundle.derivedFromRecommendationIds,
    bundleId: bundle.bundleId,
    targetType: bundle.targetType,
    ...(variantId === undefined ? {} : { variantId }),
  };
}

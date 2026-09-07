/** Tests whether a recommendation display platform applies to a policy platform. */
import type { RecommendationCatalogResponse } from "./recommendation-types.js";

export function appliesToPolicy(
  catalog: RecommendationCatalogResponse,
  displayPlatform: string,
  policyPlatform: string,
): boolean {
  return displayPlatform === policyPlatform
    || catalog.displayToImportPlatform[displayPlatform] === policyPlatform;
}

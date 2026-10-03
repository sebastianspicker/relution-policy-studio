/** Browser-safe recommendation, baseline, and compliance contracts. */
export type {
  BsiRecommendationRecord,
  CisRecommendationRecord,
  RecommendationCatalogResponse,
  RecommendationBrowseResponse,
  RecommendationBrowseRow,
  RecommendationFallbackTranslation,
  RecommendationImplementation,
  RecommendationIndexResponse,
  RecommendationRecord,
  RecommendationRuleset,
  RecommendationSource,
  RecommendationSourceSummary,
  VendorRecommendationRecord,
} from "../assurance/recommendation-types.js";
export type {
  BaselineExpertMapping,
  BaselineExpertOptionsResponse,
  BaselineExpertSetting,
  BaselineTemplateOption,
  BaselineTemplateOptionsResponse,
  BaselineTemplatePlatform,
  BaselineTemplateShape,
  BaselineTemplateTier,
} from "../assurance/baseline-template-model.js";
export type { ComplianceRecommendationResult, ComplianceReport, ComplianceStatus } from "../assurance/compliance-types.js";
export type {
  AssuranceApplicabilityContext,
  AssuranceCatalogBundle,
  AssuranceCatalogLoadResult,
  AssuranceConflictDecision,
  AssuranceParameter,
  AssurancePreset,
  AssuranceRecommendation,
  AssuranceReviewReceipt,
  AssuranceSelection,
  AssuranceSelectionApplyRequest,
  AssuranceSelectionApplyResponse,
  AssuranceSelectionExclusion,
  AssuranceSelectionPreview,
  AssuranceSelectionRequest,
  AssuranceSnapshotIndex,
  AssuranceSource,
} from "../assurance/assurance-contracts.js";
export { RECOMMENDATION_SOURCES } from "../assurance/recommendation-sources.js";

export { implementationOf } from "../assurance/recommendation-implementation.js";
export { browseRecommendationCatalog } from "../assurance/recommendation-browse.js";

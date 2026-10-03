/** Browser-safe package entry point for bundler consumers such as the workbench. */
export type { CampusWeaveEvidence, CampusWeaveMapping, CampusWeaveProfile, CampusWeaveProject } from "./campusweave.js";
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
  AssuranceSelectionExclusion,
  AssuranceSelectionPreview,
  AssuranceSelectionRequest,
  AssuranceSnapshotIndex,
  AssuranceSource,
  BaselineTemplateOption,
  BaselineTemplateOptionsResponse,
  RecommendationSource,
} from "./assurance.js";
export { canonicalJson } from "../platform/serialization/canonical-json-text.js";

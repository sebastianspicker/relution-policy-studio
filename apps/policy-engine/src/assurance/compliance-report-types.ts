/** Declares the data contract for compliance evaluation reports. */
import type {
  RecommendationRecord,
  RecommendationSource,
} from "./recommendation-types.js";
import type {
  ComplianceConfigurationReference,
  ComplianceMappingResult,
  ComplianceRemediationOption,
} from "./compliance-contracts.js";

export type { ComplianceSelection, JsonRecord } from "./compliance-contracts.js";

export type ComplianceStatus = "compliant" | "exact-gap" | "choice-required" | "parameter-required" | "not-checkable";
type ComplianceArtifactState = "loaded" | "degraded" | "unavailable";

export interface ComplianceSourceStatus {
  source: RecommendationSource;
  recommendationCatalog: ComplianceArtifactState;
  settingBundleCatalog: ComplianceArtifactState;
  warnings: string[];
}

export interface ComplianceRecommendationResult {
  id: string;
  source: RecommendationSource;
  recommendationId: string;
  recommendation: RecommendationRecord;
  status: ComplianceStatus;
  localConfigurationStatus?: ComplianceStatus;
  applicabilityStatus?: "verified" | "unresolved";
  mappingResults: ComplianceMappingResult[];
  matchedConfigurations: ComplianceConfigurationReference[];
  blockingReasons: string[];
  remediationOptions: ComplianceRemediationOption[];
}

export interface ComplianceReport {
  assuranceDigest?: string | null;
  policyPath: string;
  policyName: string;
  policyPlatform: string;
  versionIndex: number;
  sources: RecommendationSource[];
  sourceStatuses?: ComplianceSourceStatus[];
  warnings?: string[];
  results: ComplianceRecommendationResult[];
  summary: {
    totalRecommendations: number;
    byStatus: Record<ComplianceStatus, number>;
  };
}

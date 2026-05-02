import type { AppleSchemaCatalog } from "./apple-schema.js";
import type {
  RecommendationCatalogResponse,
  RecommendationImplementationSurface,
  RecommendationRecord,
  RecommendationRulesetMapping,
  RecommendationSettingBundleCatalog,
  RecommendationSource,
} from "./recommendation-types.js";
import type { RelutionTemplateBundle } from "./templates.js";
import type { PolicyWorkspace } from "./workspace.js";

export type JsonRecord = Record<string, unknown>;

export type ComplianceStatus = "compliant" | "exact-gap" | "choice-required" | "parameter-required" | "not-checkable";
export type ComplianceMappingStatus = "compliant" | "missing" | "mismatch" | "ambiguous" | "unsupported";

export interface ComplianceSelection {
  policyIndex: number;
  versionIndex: number;
}

export interface ComplianceSourceArtifacts {
  recommendationCatalog: RecommendationCatalogResponse;
  settingBundleCatalog?: RecommendationSettingBundleCatalog;
}

export interface ComplianceConfigurationReference {
  configurationIndex: number;
  type: string;
  label: string;
  schemaId?: string;
  payloadType?: string;
}

export interface ComplianceMappingResult {
  kind: RecommendationRulesetMapping["kind"];
  target: string;
  expectedValues: JsonRecord;
  status: ComplianceMappingStatus;
  matchingConfigurations: ComplianceConfigurationReference[];
  candidateConfigurations: ComplianceConfigurationReference[];
}

export interface ComplianceRemediationOption {
  id: string;
  kind: "native-bundle" | "exact-recommendation";
  label: string;
  surfaces: RecommendationImplementationSurface[];
  coveredRecommendationIds: string[];
  bundleId?: string;
  targetType?: string;
  schemaId?: string;
  payloadType?: string;
  variantId?: string;
}

export interface ComplianceRecommendationResult {
  id: string;
  source: RecommendationSource;
  recommendationId: string;
  recommendation: RecommendationRecord;
  status: ComplianceStatus;
  mappingResults: ComplianceMappingResult[];
  matchedConfigurations: ComplianceConfigurationReference[];
  blockingReasons: string[];
  remediationOptions: ComplianceRemediationOption[];
}

export interface ComplianceReport {
  policyPath: string;
  policyName: string;
  policyPlatform: string;
  versionIndex: number;
  sources: RecommendationSource[];
  results: ComplianceRecommendationResult[];
  summary: {
    totalRecommendations: number;
    byStatus: Record<ComplianceStatus, number>;
  };
}

export interface BuildComplianceReportInput {
  workspace: PolicyWorkspace;
  selection: ComplianceSelection;
  sources: RecommendationSource[];
  catalogs: Partial<Record<RecommendationSource, ComplianceSourceArtifacts>>;
  bundle: RelutionTemplateBundle;
  appleSchema: AppleSchemaCatalog;
}

export interface ApplyComplianceRemediationInput extends BuildComplianceReportInput {
  source: RecommendationSource;
  recommendationId: string;
  remediationId: string;
}

export interface ApplyComplianceRemediationResult {
  workspace: PolicyWorkspace;
  report: ComplianceReport;
  appliedRemediation: ComplianceRemediationOption;
}

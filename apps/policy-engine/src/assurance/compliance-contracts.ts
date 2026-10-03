/** Shared compliance report and remediation contracts. */
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import type {
  RecommendationCatalogResponse,
  RecommendationImplementationSurface,
  RecommendationRulesetMapping,
  RecommendationSettingBundleCatalog,
  RecommendationSource,
} from "./recommendation-types.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import type { PolicyWorkspace } from "../workspace/types.js";
import type { JsonRecord as WorkspaceJsonRecord } from "../platform/serialization/json-guards.js";
import type { AssuranceCatalogBundle, AssuranceApplicabilityContext } from "./assurance-contracts.js";

export type JsonRecord = WorkspaceJsonRecord;

export interface ComplianceRemediationOption {
  id: string;
  kind: "native-bundle" | "exact-recommendation";
  label: string;
  surfaces: RecommendationImplementationSurface[];
  coveredRecommendationIds: string[];
  available?: boolean;
  unavailableReason?: string;
  bundleId?: string;
  targetType?: string;
  schemaId?: string;
  payloadType?: string;
  variantId?: string;
}

export interface BuildComplianceReportInput {
  workspace: PolicyWorkspace;
  selection: ComplianceSelection;
  sources: RecommendationSource[];
  catalogs: Partial<Record<RecommendationSource, ComplianceSourceCatalogs>>;
  bundle: RelutionTemplateBundle;
  appleSchema: AppleSchemaCatalog;
  assurance?: { readonly catalog: AssuranceCatalogBundle; readonly applicability: AssuranceApplicabilityContext };
}

export interface ComplianceSelection {
  policyIndex: number;
  versionIndex: number;
}

export interface ComplianceSourceCatalogs {
  recommendationCatalog: RecommendationCatalogResponse;
  /** Optional source-specific setting bundles used when remediation can import a concrete Relution setting. */
  settingBundleCatalog?: RecommendationSettingBundleCatalog;
  settingBundleCatalogError?: string;
}

type ComplianceMappingStatus = "compliant" | "missing" | "mismatch" | "ambiguous" | "unsupported";

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

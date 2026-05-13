export const RECOMMENDATION_SOURCES = ["bsi", "vendor", "cis"] as const;
export const RECOMMENDATION_MAPPING_STATUSES = ["exact", "parameterized", "partial", "suggested", "none"] as const;

export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];
export type RecommendationMappingStatus = (typeof RECOMMENDATION_MAPPING_STATUSES)[number];

export interface RecommendationMappingCandidate {
  kind: string;
  target: string;
  fieldPaths: string[];
  semanticConceptId?: string;
  match?: RecommendationMappingMatch;
}

export interface RecommendationMappingMatch {
  score: number;
  matchedTerms: string[];
  valueCompatibility: string;
  reason: string;
}

export interface RecommendationParameterRequirement {
  id: string;
  path: string;
  label: string;
  description: string;
  defaultValue?: unknown;
}

export interface RecommendationProcessSupport {
  id: string;
  relutionFunction: string;
  evidence: string;
}

export type RecommendationValueConstraintOperator = "atLeast" | "atMost" | "containsAll";

export interface RecommendationValueConstraint {
  path: string;
  operator: RecommendationValueConstraintOperator;
  value: unknown;
}

export interface RecommendationRulesetMapping {
  kind: string;
  type?: string;
  payloadType?: string;
  schemaId?: string;
  values?: Record<string, unknown>;
  constraints?: RecommendationValueConstraint[];
  match?: RecommendationMappingMatch;
}

export type RecommendationImplementationCategory =
  | "relution-achievable"
  | "relution-partial"
  | "helper-only"
  | "gap";

export type RecommendationImplementationSurface =
  | "relution-native"
  | "apple-mobileconfig"
  | "apple-schema-profile"
  | "helper";

export type RecommendationImportSurface = "apply-json" | "ruleset-import";

export interface RecommendationImplementation {
  category: RecommendationImplementationCategory;
  surfaces: RecommendationImplementationSurface[];
  importableVia: RecommendationImportSurface[];
  blockingReasons: string[];
}

export interface RecommendationRelutionMapping {
  status: RecommendationMappingStatus;
  mergeableInImportableRuleset: boolean;
  candidates: RecommendationMappingCandidate[];
  rulesetMappings: RecommendationRulesetMapping[];
  parameterRequirements?: RecommendationParameterRequirement[];
  processSupport?: RecommendationProcessSupport[];
  notes: string[];
}

export interface RecommendationThreatContext {
  title: string;
  text: string;
}

export interface RecommendationErratum {
  sourceId?: string;
  section?: string;
  text?: string;
}

export interface BsiGrundschutzKompendiumRelatedChecklistItem {
  moduleId: string;
  moduleTitle: string;
  requirementId: string;
  title: string;
  type: string;
  sourcePath: string;
  matchedReasons: string[];
  relatedGrundschutzPlusPlusControlIds: string[];
  text: string;
}

export interface BsiGrundschutzKompendiumContext {
  individualChecklistSourcePath?: string;
  individualChecklistRequirementType?: string;
  individualChecklistMatchesDocBook?: boolean;
  individualChecklistTitle?: string;
  individualChecklistText?: string;
  differences: string[];
  relatedChecklistItems: BsiGrundschutzKompendiumRelatedChecklistItem[];
}

export interface BsiGrundschutzPlusPlusControlReference {
  id: string;
  title: string;
  practiceId: string;
  practiceTitle: string;
  controlGroupId: string;
  controlGroupTitle: string;
  securityLevel?: string;
  effortLevel?: string;
  modalVerb?: string;
  actionWord?: string;
  targetObjectCategories: string[];
  documentation: string[];
  tags: string[];
  parameters: Array<{
    id: string;
    label: string;
    values: string[];
  }>;
  statement: string;
  matchReason: string;
}

export interface BsiGrundschutzPlusPlusContext {
  methodDocument: string;
  methodVersion: string;
  catalogVersion: string;
  policyEditorRole: string;
  processSteps: Array<{
    step: number;
    name: string;
    pdcaPhase: string;
  }>;
  platformTargetObjectCategories: string[];
  relatedControls: BsiGrundschutzPlusPlusControlReference[];
  notes: string[];
}

export interface BsiSemanticConceptEvidenceSource {
  source: string;
  sourceId?: string;
  gsControlId?: string;
  modalVerb?: string;
  securityLevel?: string;
  matchedTerms: string[];
  confidence: number;
  excerpt: string;
}

export interface BsiSemanticConceptCandidateTarget {
  platform: string;
  kind: string;
  target: string;
  fieldPaths: string[];
  reason: string;
}

export interface BsiSemanticConceptEvidence {
  id: string;
  label: {
    de: string;
    en: string;
  };
  matchedTerms: string[];
  evidence: BsiSemanticConceptEvidenceSource[];
  confidence: number;
  relatedGrundschutzPlusPlusControlIds: string[];
  candidateTargets: BsiSemanticConceptCandidateTarget[];
}

/** Unified recommendation semantics reuse the BSI evidence vocabulary as the cross-source canonical shape. */
export type RecommendationSemanticConceptEvidenceSource = BsiSemanticConceptEvidenceSource;
/** Unified recommendation semantics reuse BSI candidate targets so source-specific records can be compared directly. */
export type RecommendationSemanticConceptCandidateTarget = BsiSemanticConceptCandidateTarget;
/** Cross-source semantic concept evidence is currently normalized to the BSI concept evidence schema. */
export type RecommendationSemanticConceptEvidence = BsiSemanticConceptEvidence;

export type CisRecommendationHelperFallbackMethod =
  | "powershell"
  | "auditpol"
  | "terminal"
  | "profile-method"
  | "group-policy-path"
  | "registry-reference";

export interface CisRecommendationHelperProfileKey {
  key: string;
  value: string;
}

export interface CisRecommendationHelperFallback {
  id: string;
  role: "audit" | "remediation";
  method: CisRecommendationHelperFallbackMethod;
  title: string;
  rawText: string;
  commands: string[];
  groupPolicyPaths?: string[];
  registryPaths?: string[];
  profilePayloadType?: string;
  profileKeys?: CisRecommendationHelperProfileKey[];
}

export interface RecommendationFallbackTranslation {
  id: string;
  role: "audit" | "remediation";
  method: CisRecommendationHelperFallbackMethod;
  title: string;
  rawText: string;
  commands: string[];
  groupPolicyPaths?: string[];
  registryPaths?: string[];
  profilePayloadType?: string;
  profileKeys?: CisRecommendationHelperProfileKey[];
}

export interface RecommendationRecordBase {
  id: string;
  platform: string;
  title: string;
  relutionMapping: RecommendationRelutionMapping;
  implementation?: RecommendationImplementation;
  fallbackTranslations?: RecommendationFallbackTranslation[];
  semanticConcepts?: RecommendationSemanticConceptEvidence[];
  semanticNoConceptReason?: string;
}

export interface RecommendationRecordSharedSourceFields {
  sourceIds: string[];
  fallbackTranslations?: RecommendationFallbackTranslation[];
}

export interface BsiRecommendationRecord extends RecommendationRecordBase, RecommendationRecordSharedSourceFields {
  osFamily: string;
  policyName: string;
  moduleId: string;
  moduleTitle: string;
  moduleRole?: string;
  supportingSourceIds: string[];
  category: string;
  requirementId: string;
  status: string;
  protectionLevel: string;
  /** BSI actor categories associated with the requirement, not application users. */
  actors: string[];
  /** Requirement text paragraphs extracted from the source requirement. */
  paragraphs: string[];
  requirementText: string;
  reason: string;
  descriptionContext: string[];
  checklistThreatIds: string[];
  checklistThreatTitles: string[];
  moduleThreatContext: RecommendationThreatContext[];
  errata: RecommendationErratum[];
  grundschutzKompendium?: BsiGrundschutzKompendiumContext;
  grundschutzPlusPlus?: BsiGrundschutzPlusPlusContext;
  semanticConcepts?: BsiSemanticConceptEvidence[];
  semanticNoConceptReason?: string;
}

export interface CisRecommendationRecord extends RecommendationRecordBase, RecommendationRecordSharedSourceFields {
  osFamily: string;
  benchmarkId: string;
  benchmarkTitle: string;
  benchmarkVersion: string;
  benchmarkDate: string;
  managementSurface: string;
  sourcePdfPath: string;
  familySourceId?: string;
  recommendationId: string;
  assessmentStatus?: string;
  profileApplicability: string[];
  description: string;
  rationale: string;
  impact: string;
  audit: string;
  remediation: string;
  defaultValue: unknown;
  additionalInformation?: string;
  references: string[];
  recommendedValue: unknown;
  helperFallbacks: CisRecommendationHelperFallback[];
}

export interface VendorRecommendationRecord extends RecommendationRecordBase, RecommendationRecordSharedSourceFields {
  section: string;
  recommendedValue: unknown;
  reason: string;
  reasonSource?: string;
  vendor: Record<string, unknown>;
}

export type RecommendationRecord =
  | BsiRecommendationRecord
  | CisRecommendationRecord
  | VendorRecommendationRecord;

export interface RecommendationRulesetRule {
  id: string;
  title: string;
  informational?: boolean;
  mappings?: RecommendationRulesetMapping[];
}

export interface RecommendationRulesetPolicy {
  platform: string;
  name: string;
  description?: string;
  rules: RecommendationRulesetRule[];
}

export interface RecommendationRuleset {
  version: number;
  name: string;
  verifiedAsOf?: string;
  sourceIndexPath?: string;
  recommendationCatalogPath?: string;
  policies: RecommendationRulesetPolicy[];
}

export interface RecommendationSettingBundle {
  bundleId: string;
  source: RecommendationSource;
  sourcePlatform: string;
  policyPlatform: string;
  targetType: string;
  variantId?: string;
  importFilePath: string;
  details: Record<string, unknown>;
  derivedFromRecommendationIds: string[];
  sourceIds: string[];
  mergeStrategy: string;
}

export interface RecommendationSettingVariantGroup {
  groupId: string;
  policyPlatform: string;
  targetType: string;
  conflictingPaths: string[];
  variants: Array<{
    bundleId: string;
    variantId: string;
    importFilePath: string;
  }>;
}

export interface RecommendationNonImportableRecommendation {
  recommendationId: string;
  mappingStatus: RecommendationMappingStatus;
  candidateTargets: string[];
  notes: string[];
}

export interface RecommendationSettingBundleCatalog {
  version: number;
  name: string;
  verifiedAsOf?: string;
  sourceRecommendationCatalogPath: string;
  importableRulesetPath: string;
  bundles: RecommendationSettingBundle[];
  variantGroups: RecommendationSettingVariantGroup[];
  nonImportableRecommendations: RecommendationNonImportableRecommendation[];
}

export interface RecommendationSourceSummary {
  source: RecommendationSource;
  label: string;
  available: boolean;
  verifiedAsOf?: string;
  recommendationCount: number;
  coverageSummary?: RecommendationSourceCoverageSummary;
  displayPlatforms: string[];
  importPlatforms: string[];
  displayToImportPlatform: Record<string, string>;
  error?: string;
}

export interface RecommendationSourceCoverageSummary {
  exactMappings: number;
  actionableRecommendations: number;
  partialRecommendations: number;
  helperOnlyRecommendations: number;
  gapRecommendations: number;
}

export interface RecommendationIndexResponse {
  sources: RecommendationSourceSummary[];
}

export interface RecommendationCatalogResponse extends RecommendationSourceSummary {
  recommendations: RecommendationRecord[];
  ruleset?: RecommendationRuleset;
}

export interface RecommendationCoverageRow {
  source: RecommendationSource;
  recommendationId: string;
  platform: string;
  title: string;
  category: RecommendationImplementationCategory;
  surfaces: RecommendationImplementationSurface[];
  importableVia: RecommendationImportSurface[];
  mappingStatus: RecommendationMappingStatus;
  targetTypes: string[];
  candidateTargetTypes: string[];
  blockingReasons: string[];
}

export interface RecommendationCoverageMatrix {
  version: number;
  name: string;
  generatedAt: string;
  rows: RecommendationCoverageRow[];
  summary: {
    totalRecommendations: number;
    bySource: Record<string, number>;
    byPlatform: Record<string, number>;
    byCategory: Record<string, number>;
    bySurface: Record<string, number>;
  };
}

export interface RecommendationSemanticIndexConcept {
  id: string;
  label: Record<string, string>;
  matchedTerms: string[];
  relutionTargetIds: string[];
  recommendationIds: string[];
  exactRecommendationIds: string[];
  candidateRecommendationIds: string[];
}

export interface RecommendationSemanticIndexTarget {
  id: string;
  platform: string;
  kind: string;
  target: string;
  fieldPaths: string[];
  labels: string[];
  conceptIds: string[];
  exactRecommendationIds: string[];
  candidateRecommendationIds: string[];
}

export interface RecommendationSemanticIndexRecommendation {
  source: RecommendationSource;
  recommendationId: string;
  platform: string;
  title: string;
  semanticConceptIds: string[];
  exactTargetIds: string[];
  candidateTargetIds: string[];
}

export interface RecommendationSemanticIndex {
  version: number;
  name: string;
  generatedAt: string;
  concepts: RecommendationSemanticIndexConcept[];
  relutionTargets: RecommendationSemanticIndexTarget[];
  recommendations: RecommendationSemanticIndexRecommendation[];
  summary: {
    totalConcepts: number;
    totalRelutionTargets: number;
    totalRecommendations: number;
    bySource: Record<string, number>;
    byPlatform: Record<string, number>;
  };
}

export interface RecommendationUnifiedAnalysisPrecedence {
  authoritativeSource: RecommendationSource;
  behavior: "rank-and-annotate";
  note: string;
}

export interface RecommendationUnifiedAnalysisSample {
  source: RecommendationSource;
  recommendationId: string;
  title: string;
  mappingStatus: RecommendationMappingStatus;
}

export interface RecommendationUnifiedAnalysisGroup {
  id: string;
  platform: string;
  conceptId: string;
  label: Record<string, string>;
  sources: RecommendationSource[];
  missingSources: RecommendationSource[];
  authoritativeSource: RecommendationSource | null;
  sourceCounts: Partial<Record<RecommendationSource, number>>;
  recommendationsBySource: Partial<Record<RecommendationSource, string[]>>;
  sampleRecommendations: RecommendationUnifiedAnalysisSample[];
  exactTargetIdsBySource: Partial<Record<RecommendationSource, string[]>>;
  candidateTargetIdsBySource: Partial<Record<RecommendationSource, string[]>>;
  sharedRelutionTargetIds: string[];
}

export type RecommendationUnifiedAnalysisDifferenceSeverity = "error" | "warning" | "info";

export interface RecommendationUnifiedAnalysisExactValue {
  recommendationId: string;
  title: string;
  value: unknown;
  constraints: RecommendationValueConstraint[];
}

export interface RecommendationUnifiedAnalysisDifference {
  id: string;
  type: string;
  severity: RecommendationUnifiedAnalysisDifferenceSeverity;
  platform: string;
  conceptId?: string;
  kind?: string;
  target?: string;
  fieldPath?: string;
  sources: RecommendationSource[];
  missingSources?: RecommendationSource[];
  authoritativeSource?: RecommendationSource;
  resolution: string;
  supportBySource?: Partial<Record<RecommendationSource, string>>;
  valuesBySource?: Partial<Record<RecommendationSource, RecommendationUnifiedAnalysisExactValue[]>>;
}

export interface RecommendationUnifiedAnalysis {
  version: number;
  name: string;
  generatedAt: string;
  precedence: RecommendationUnifiedAnalysisPrecedence;
  commonGroups: RecommendationUnifiedAnalysisGroup[];
  contradictions: RecommendationUnifiedAnalysisDifference[];
  differences: RecommendationUnifiedAnalysisDifference[];
  summary: {
    totalCommonGroups: number;
    commonGroupsByPlatform: Record<string, number>;
    commonGroupsBySourceCoverage: Record<string, number>;
    hardContradictions: number;
    differences: number;
    bsiAuthoritativeDifferences: number;
    sourceRecommendationCounts: Record<RecommendationSource, number>;
  };
}

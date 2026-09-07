/** Declares the normalized recommendation catalog and mapping data model. */
export type RecommendationSource = "bsi" | "vendor" | "cis";

type RecommendationMappingStatus = "exact" | "parameterized" | "partial" | "suggested" | "none";

interface RecommendationMappingCandidate {
  kind: string;
  target: string;
  fieldPaths: string[];
  semanticConceptId?: string;
  match?: RecommendationMappingMatch;
}

interface RecommendationMappingMatch {
  score: number;
  matchedTerms: string[];
  valueCompatibility: string;
  reason: string;
}

interface RecommendationParameterRequirement {
  id: string;
  path: string;
  label: string;
  description: string;
  defaultValue?: unknown;
}

interface RecommendationProcessSupport {
  id: string;
  relutionFunction: string;
  evidence: string;
}

type RecommendationValueConstraintOperator = "atLeast" | "atMost" | "containsAll";

interface RecommendationValueConstraint {
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

type RecommendationImportSurface = "apply-json" | "ruleset-import";

export interface RecommendationImplementation {
  category: RecommendationImplementationCategory;
  surfaces: RecommendationImplementationSurface[];
  importableVia: RecommendationImportSurface[];
  blockingReasons: string[];
}

interface RecommendationRelutionMapping {
  status: RecommendationMappingStatus;
  mergeableInImportableRuleset: boolean;
  candidates: RecommendationMappingCandidate[];
  rulesetMappings: RecommendationRulesetMapping[];
  parameterRequirements?: RecommendationParameterRequirement[];
  processSupport?: RecommendationProcessSupport[];
  notes: string[];
}

interface RecommendationThreatContext {
  title: string;
  text: string;
}

interface RecommendationErratum {
  sourceId?: string;
  section?: string;
  text?: string;
}

interface BsiGrundschutzKompendiumRelatedChecklistItem {
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

interface BsiGrundschutzKompendiumContext {
  individualChecklistSourcePath?: string;
  individualChecklistRequirementType?: string;
  individualChecklistMatchesDocBook?: boolean;
  individualChecklistTitle?: string;
  individualChecklistText?: string;
  differences: string[];
  relatedChecklistItems: BsiGrundschutzKompendiumRelatedChecklistItem[];
}

interface BsiGrundschutzPlusPlusControlReference {
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

interface BsiGrundschutzPlusPlusContext {
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

interface BsiSemanticConceptEvidenceSource {
  source: string;
  sourceId?: string;
  gsControlId?: string;
  modalVerb?: string;
  securityLevel?: string;
  matchedTerms: string[];
  confidence: number;
  excerpt: string;
}

interface BsiSemanticConceptCandidateTarget {
  platform: string;
  kind: string;
  target: string;
  fieldPaths: string[];
  reason: string;
}

interface BsiSemanticConceptEvidence {
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

type RecommendationFallbackMethod =
  | "powershell"
  | "auditpol"
  | "terminal"
  | "profile-method"
  | "group-policy-path"
  | "registry-reference";

interface RecommendationFallbackProfileKey {
  key: string;
  value: string;
}

export interface RecommendationFallbackTranslation {
  id: string;
  role: "audit" | "remediation";
  method: RecommendationFallbackMethod;
  title: string;
  rawText: string;
  commands: string[];
  groupPolicyPaths?: string[];
  registryPaths?: string[];
  profilePayloadType?: string;
  profileKeys?: RecommendationFallbackProfileKey[];
}

interface RecommendationRecordBase {
  id: string;
  platform: string;
  title: string;
  relutionMapping: RecommendationRelutionMapping;
  implementation?: RecommendationImplementation;
  fallbackTranslations?: RecommendationFallbackTranslation[];
  semanticConcepts?: BsiSemanticConceptEvidence[];
  semanticNoConceptReason?: string;
}

interface RecommendationRecordSharedSourceFields {
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

interface RecommendationRulesetRule {
  id: string;
  title: string;
  informational?: boolean;
  mappings?: RecommendationRulesetMapping[];
}

interface RecommendationRulesetPolicy {
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

interface RecommendationSettingVariantGroup {
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

interface RecommendationNonImportableRecommendation {
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

interface RecommendationCoverageRow {
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

interface RecommendationSemanticIndexConcept {
  id: string;
  label: Record<string, string>;
  matchedTerms: string[];
  relutionTargetIds: string[];
  recommendationIds: string[];
  exactRecommendationIds: string[];
  candidateRecommendationIds: string[];
}

interface RecommendationSemanticIndexTarget {
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

interface RecommendationSemanticIndexRecommendation {
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

interface RecommendationUnifiedAnalysisPrecedence {
  authoritativeSource: RecommendationSource;
  behavior: "rank-and-annotate";
  note: string;
}

interface RecommendationUnifiedAnalysisSample {
  source: RecommendationSource;
  recommendationId: string;
  title: string;
  mappingStatus: RecommendationMappingStatus;
}

interface RecommendationUnifiedAnalysisGroup {
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

type RecommendationUnifiedAnalysisDifferenceSeverity = "error" | "warning" | "info";

interface RecommendationUnifiedAnalysisExactValue {
  recommendationId: string;
  title: string;
  value: unknown;
  constraints: RecommendationValueConstraint[];
}

interface RecommendationUnifiedAnalysisDifference {
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

/** Compact browsing projection. Evidence and executable mappings remain in detail/ruleset responses. */
export interface RecommendationBrowseRow {
  id: string;
  platform: string;
  title: string;
  displayIdentifier: string;
  searchTerms: string[];
  relutionMapping: Pick<RecommendationRelutionMapping, "status">;
  implementation: Omit<RecommendationImplementation, "blockingReasons">;
  hasRulesetMappings: boolean;
}

export interface RecommendationBrowseResponse extends RecommendationSourceSummary {
  recommendations: RecommendationBrowseRow[];
  actionableImportPlatforms: string[];
}

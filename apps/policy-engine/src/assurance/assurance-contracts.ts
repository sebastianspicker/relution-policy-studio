/** Browser-safe contracts for provenance-bound assurance selection and preview. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";

export type AssuranceMappingFamily = "relution-native" | "apple-schema-profile" | "apple-mobileconfig";
export type AssuranceDisposition = "supported" | "parameter" | "candidate" | "organizational" | "unsupported";
export type AssuranceApplicabilityField = "platform" | "osVersion" | "enrollmentChannel" | "deviceOwnership" | "supervision";
export type AssurancePredicateOperator = "equals" | "atLeast" | "atMost" | "oneOf";
type AssuranceConstraintOperator = AssurancePredicateOperator | "containsAll";

interface AssuranceSourceSnapshot {
  readonly bodyDigestAvailable: boolean;
  readonly localPath: string | null;
  readonly digestKind: string;
}

interface AssuranceRefresh {
  readonly freshnessState: "outdated" | "unknown";
  readonly checkedAt: string | null;
  readonly outcome: string;
  readonly reportPath: string;
}

export interface AssuranceSource {
  readonly sourceId: string;
  readonly title: string;
  readonly edition: string;
  readonly publicationDate: string | null;
  readonly retrievedAt: string | null;
  readonly lastCheckedAt: string | null;
  readonly jurisdiction: string;
  readonly authority: string;
  readonly url: string;
  readonly license: string;
  readonly digest: string;
  readonly snapshot: AssuranceSourceSnapshot;
  readonly refresh: AssuranceRefresh;
}

export interface AssuranceApplicabilityPredicate {
  readonly field: AssuranceApplicabilityField;
  readonly operator: AssurancePredicateOperator;
  readonly value: string | readonly string[];
}

export interface AssuranceApplicability {
  readonly operator: "all";
  readonly predicates: readonly AssuranceApplicabilityPredicate[];
  readonly unresolvedRequirements?: readonly string[];
}

export interface AssuranceMapping {
  readonly family: AssuranceMappingFamily;
  readonly target: string;
  readonly values: JsonRecord;
  readonly instanceId?: string;
}

export interface AssuranceConstraint {
  readonly path: string;
  readonly operator: AssuranceConstraintOperator;
  readonly value: unknown;
  readonly strength?: { readonly comparison: "exact" | "ordered" | "set" | "unknown"; readonly strongerDirection: "not-defined" | "higher" | "lower" | "superset" };
}

export type AssuranceParameterValueType = "boolean" | "integer" | "number" | "string" | "enum";

export interface AssuranceParameter {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly required: boolean;
  readonly valueType: AssuranceParameterValueType;
  readonly defaultValue?: unknown;
  readonly allowedValues?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
}

interface AssuranceProvenance {
  readonly sourceId: string;
  readonly sourceRecommendationId: string;
  readonly sourceDigest: string;
  readonly evidence: readonly string[];
}

export interface AssuranceRecommendation {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceFamily: "bsi" | "cis" | "vendor";
  readonly sourceRecommendationId: string;
  readonly title: string;
  readonly platform: string;
  readonly disposition: AssuranceDisposition;
  readonly selectable: boolean;
  readonly applicability: AssuranceApplicability;
  readonly mapping?: AssuranceMapping;
  readonly constraints: readonly AssuranceConstraint[];
  readonly parameters: readonly AssuranceParameter[];
  readonly provenance: AssuranceProvenance;
  readonly dispositionReasons: readonly string[];
  readonly detailReference: { readonly detailsPath: string; readonly lookupId: string; readonly endpoint?: string; readonly recommendationId?: string; readonly snapshotScoped?: boolean };
  readonly rationale: string | null;
  readonly impact: string | null;
  readonly prerequisites: readonly string[];
  readonly requirementStrength: "must" | "should" | "may" | "not-stated";
  readonly errata: { readonly present: boolean; readonly entries: readonly JsonRecord[] };
  readonly refresh: AssuranceRefresh;
}

export interface AssuranceCatalog {
  readonly schemaVersion: 1;
  readonly artifactVersion: string;
  readonly generatedBy: string;
  readonly corpusDigest: string;
  readonly sourceCheckedAt: string | null;
  readonly freshnessClaim: string;
  readonly sources: readonly AssuranceSource[];
  readonly recommendations: readonly AssuranceRecommendation[];
  readonly summary: JsonRecord;
  readonly reconciliationPath: string;
  readonly refreshReportPath: string;
}

export interface AssurancePresetSelection {
  readonly recommendationId: string;
  readonly fixedValues: JsonRecord;
  readonly parameterDefaults: JsonRecord;
  readonly settingRationales: Readonly<Record<string, string>>;
  readonly overrideJustifications: Readonly<Record<string, string | null>>;
}

interface AssurancePresetExclusion {
  readonly recommendationId: string;
  readonly reason: string;
}

export interface AssurancePreset {
  readonly description?: string;
  readonly rationale?: string;
  readonly profileOrigin?: string;
  readonly authorityClaim?: string;
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly inherits: string | null;
  readonly selections: readonly AssurancePresetSelection[];
  readonly exclusions: readonly AssurancePresetExclusion[];
  readonly requiresReadinessReview: boolean;
  readonly prerequisites: readonly string[];
  readonly impact: string | null;
}

export interface AssurancePresetCatalog {
  readonly schemaVersion: 1;
  readonly artifactVersion: string;
  readonly catalogArtifactVersion: string;
  readonly catalogDigest: string;
  readonly presets: readonly AssurancePreset[];
}

export interface AssuranceCatalogBundle {
  readonly catalog: AssuranceCatalog;
  readonly presets: AssurancePresetCatalog;
  readonly assuranceDigest: string;
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly presetDigest: string;
  readonly snapshotDigest: string;
  readonly detailsDigest: string;
}

export type AssuranceCatalogLoadResult =
  | ({ readonly status: "available" } & AssuranceCatalogBundle)
  | { readonly status: "unavailable"; readonly error: string };

export interface AssuranceSnapshotEntry {
  readonly snapshotDigest: string;
  readonly artifactVersion: string;
  readonly corpusDigest: string;
  readonly catalogDigest: string;
  readonly catalogPath: string;
  readonly presetsPath: string;
  readonly detailsPath: string;
  readonly detailsDigest: string;
  readonly sourceCheckedAt: string;
  readonly status: "retained";
}

export interface AssuranceSnapshotIndex {
  readonly schemaVersion: 1;
  readonly currentSnapshotDigest: string;
  readonly entries: readonly AssuranceSnapshotEntry[];
}

export interface AssuranceDetailEntry {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceRecommendationId: string;
  readonly record: JsonRecord;
}

export interface AssuranceDetailsCatalog {
  readonly schemaVersion: 1;
  readonly artifactVersion: string;
  readonly catalogDigest: string;
  readonly recommendations: readonly AssuranceDetailEntry[];
}

export type AssuranceSelection =
  | { readonly kind: "recommendation"; readonly recommendationId: string }
  | { readonly kind: "preset"; readonly presetId: string; readonly presetVersion: string };

export interface AssuranceApplicabilityContext {
  readonly osVersion?: string;
  readonly enrollmentChannel?: string;
  readonly deviceOwnership?: string;
  readonly supervision?: string;
}

export interface AssuranceConflictDecision {
  readonly path: string;
  readonly winnerRecommendationId: string;
  readonly rationale: string;
}

export interface AssuranceSelectionExclusion {
  readonly recommendationId: string;
  readonly reason: string;
}

interface AssuranceSelectionTarget {
  readonly policyPath: string;
  readonly versionIndex: number;
}

export interface AssuranceSelectionRequest {
  readonly expectedRevision: string;
  readonly workspace: import("../workspace/types.js").PolicyWorkspace;
  readonly target: AssuranceSelectionTarget;
  readonly selection: AssuranceSelection;
  readonly applicability?: AssuranceApplicabilityContext;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly decisions?: readonly AssuranceConflictDecision[];
  readonly exclusions?: readonly AssuranceSelectionExclusion[];
  readonly obligations?: readonly string[];
  readonly exceptions?: readonly string[];
  readonly acknowledgedSourceDigests?: readonly string[];
  readonly snapshotDigest?: string;
  readonly readinessReview?: { readonly reviewed: true; readonly rationale: string };
}

export interface AssuranceChange {
  readonly recommendationIds: readonly string[];
  readonly family: AssuranceMappingFamily;
  readonly target: string;
  readonly path: string;
  readonly before?: unknown;
  readonly after: unknown;
}

export interface AssuranceRetainedValue {
  readonly recommendationIds: readonly string[];
  readonly family: AssuranceMappingFamily;
  readonly target: string;
  readonly path: string;
  readonly value: unknown;
  readonly reason: "already-satisfies" | "stronger-existing";
}

export interface AssuranceConflict {
  readonly path: string;
  readonly recommendationIds: readonly string[];
  readonly values: readonly unknown[];
  readonly resolvedBy?: AssuranceConflictDecision;
}

export interface AssuranceSelectionPreview {
  readonly ready: boolean;
  readonly workspaceRevision: string;
  readonly draftDigest: string;
  readonly resultDigest: string;
  readonly assuranceDigest: string;
  readonly snapshotDigest: string;
  readonly snapshotSelection: "current" | "retained";
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly presetDigest?: string;
  readonly selection: AssuranceSelection;
  readonly recommendationIds: readonly string[];
  readonly changes: readonly AssuranceChange[];
  readonly retained: readonly AssuranceRetainedValue[];
  readonly exclusions: readonly AssuranceSelectionExclusion[];
  readonly conflicts: readonly AssuranceConflict[];
  readonly decisions: readonly AssuranceConflictDecision[];
  readonly obligations: readonly string[];
  readonly exceptions: readonly string[];
  readonly acknowledgedSourceDigests: readonly string[];
  readonly unacknowledgedSourceDigests: readonly string[];
  readonly unresolvedParameters: readonly string[];
  readonly unresolvedApplicability: readonly AssuranceSelectionExclusion[];
  readonly readinessReview?: { readonly reviewed: true; readonly rationale: string };
  readonly previewDigest: string;
}

export interface AssuranceSelectionApplyRequest extends AssuranceSelectionRequest {
  readonly draftDigest: string;
  readonly previewDigest: string;
  readonly assuranceDigest: string;
  readonly resolvedSnapshotDigest: string;
  readonly snapshotSelection: "current" | "retained";
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly presetDigest?: string;
  readonly resultDigest: string;
}

export interface AssuranceReviewReceipt extends JsonRecord {
  readonly version: 1;
  readonly workspaceRevision: string;
  readonly draftDigest: string;
  readonly resultDigest: string;
  readonly selection: AssuranceSelection;
  readonly recommendationIds: readonly string[];
  readonly previewDigest: string;
  readonly assuranceDigest: string;
  readonly snapshotDigest: string;
  readonly snapshotSelection: "current" | "retained";
  readonly sourceDigests: Readonly<Record<string, string>>;
  readonly presetDigest?: string;
  readonly changes: readonly AssuranceChange[];
  readonly retained: readonly AssuranceRetainedValue[];
  readonly exclusions: readonly AssuranceSelectionExclusion[];
  readonly conflicts: readonly AssuranceConflict[];
  readonly decisions: readonly AssuranceConflictDecision[];
  readonly obligations: readonly string[];
  readonly exceptions: readonly string[];
  readonly acknowledgedSourceDigests: readonly string[];
  readonly readinessReview?: { readonly reviewed: true; readonly rationale: string };
}

export interface AssuranceSelectionApplyResponse {
  readonly workspace: import("../workspace/types.js").PolicyWorkspace;
  readonly revision: string;
  readonly preview: AssuranceSelectionPreview;
  readonly receipt: AssuranceReviewReceipt;
}

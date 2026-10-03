/** Synthetic source evidence isolates runtime behavior from harvested catalog changes. */
import { loadTemplateBundle } from "../../src/assurance/template-bundle.js";
import { loadAppleSchemaCatalog } from "../../src/apple/apple-schema-catalog.js";
import { createNewWorkspaceInMemory } from "../../src/workspace/workspace-creation.js";
import { addConfigurationToLoadedWorkspace } from "../../src/workspace/workspace-configuration-actions.js";
import { assuranceCanonicalDigest } from "../../src/assurance/assurance-json.js";
import type { AssuranceCatalog, AssuranceCatalogBundle, AssuranceRecommendation, AssurancePresetCatalog, AssuranceSelectionRequest, AssuranceSelectionPreview, AssuranceSelectionApplyRequest } from "../../src/assurance/assurance-contracts.js";
import type { JsonRecord } from "../../src/platform/serialization/json-guards.js";
import type { PolicyWorkspace } from "../../src/workspace/types.js";

export const DIGEST = "a".repeat(64);
const refresh = { freshnessState: "unknown", checkedAt: null, outcome: "synthetic test source", reportPath: "fixture.json" } as const;
export function recommendation(overrides: Partial<AssuranceRecommendation> = {}): AssuranceRecommendation {
  return { id: "bsi:one", sourceId: "bsi:document", sourceFamily: "bsi", sourceRecommendationId: "one", title: "Synthetic minimum length", platform: "IOS", disposition: "supported", selectable: true,
    applicability: { operator: "all", predicates: [{ field: "platform", operator: "equals", value: "IOS" }] },
    mapping: { family: "relution-native", target: "IOS_PASSCODE", values: { minLength: 6 } }, constraints: [{ path: "/minLength", operator: "atLeast", value: 6 }], parameters: [],
    provenance: { sourceId: "bsi:document", sourceRecommendationId: "one", sourceDigest: DIGEST, evidence: ["bsi:document"] }, dispositionReasons: ["Synthetic evidenced mapping"],
    detailReference: { detailsPath: "example/recommendation-coverage/assurance-details.json", lookupId: "bsi:one" }, rationale: "Foundational authentication", impact: "Longer passcodes", prerequisites: [], requirementStrength: "must", errata: { present: false, entries: [] }, refresh, ...overrides };
}
export function catalogBundle(records: AssuranceRecommendation[]): AssuranceCatalogBundle {
  const catalog: AssuranceCatalog = { schemaVersion: 1, artifactVersion: "1.0.0", generatedBy: "synthetic fixture", corpusDigest: DIGEST, sourceCheckedAt: null, freshnessClaim: "Synthetic", recommendations: records,
    sources: [{ sourceId: "bsi:document", title: "Synthetic source", edition: "1", publicationDate: null, retrievedAt: null, lastCheckedAt: null, jurisdiction: "DE", authority: "Synthetic", url: "https://example.test/source", license: "test", digest: DIGEST, snapshot: { bodyDigestAvailable: false, localPath: null, digestKind: "synthetic" }, refresh }], summary: {}, reconciliationPath: "fixture.json", refreshReportPath: "fixture.json" };
  const presets: AssurancePresetCatalog = { schemaVersion: 1, artifactVersion: "1.0.0", catalogArtifactVersion: catalog.artifactVersion, catalogDigest: assuranceCanonicalDigest(catalog), presets: [{ id: "essential", version: "1", title: "Essential", inherits: null, selections: records.filter(r => r.selectable).map(r => ({ recommendationId: r.id, fixedValues: {}, parameterDefaults: {}, settingRationales: {}, overrideJustifications: {} })), exclusions: [], requiresReadinessReview: false, prerequisites: [], impact: null }] };
  const snapshotDigest = assuranceCanonicalDigest({ catalog, presets });
  return { catalog, presets, snapshotDigest, assuranceDigest: snapshotDigest, sourceDigests: { "bsi:document": DIGEST }, presetDigest: assuranceCanonicalDigest(presets), detailsDigest: DIGEST };
}
export function fixture(records = [recommendation()], existing = true) {
  const bundle = loadTemplateBundle();
  const workspace = createNewWorkspaceInMemory({ workspace: "/unused/assurance-test", name: "Synthetic assurance", platform: records[0]!.platform, serverVersion: bundle.serverVersion });
  if (existing) addConfigurationToLoadedWorkspace(workspace, bundle, { policyPath: workspace.policies[0]!.path, versionIndex: 0, type: records[0]!.mapping!.target });
  const dependencies = { bundle, appleSchema: loadAppleSchemaCatalog(), catalog: catalogBundle(records), workspaceRevision: DIGEST };
  const input: AssuranceSelectionRequest = { workspace, expectedRevision: DIGEST, target: { policyPath: workspace.policies[0]!.path, versionIndex: 0 }, selection: { kind: "recommendation", recommendationId: records[0]!.id }, acknowledgedSourceDigests: [DIGEST] };
  return { input, dependencies };
}
export function configurations(workspace: PolicyWorkspace): JsonRecord[] {
  return ((workspace.policies[0]!.document.versions as JsonRecord[])[0]!.configurations as JsonRecord[]);
}
export function applyRequest(input: AssuranceSelectionRequest, preview: AssuranceSelectionPreview): AssuranceSelectionApplyRequest {
  return { ...input, draftDigest: preview.draftDigest, resultDigest: preview.resultDigest, previewDigest: preview.previewDigest, assuranceDigest: preview.assuranceDigest, resolvedSnapshotDigest: preview.snapshotDigest, snapshotSelection: preview.snapshotSelection, sourceDigests: preview.sourceDigests, ...(preview.presetDigest === undefined ? {} : { presetDigest: preview.presetDigest }) };
}

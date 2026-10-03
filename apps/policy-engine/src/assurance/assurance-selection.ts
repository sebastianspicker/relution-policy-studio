/** Previews and verifies exact recommendation or preset application to an unsaved workspace draft. */
import { isDeepStrictEqual } from "node:util";
import type { AppleSchemaCatalog } from "../apple/apple-schema-types.js";
import type { RelutionTemplateBundle } from "../contracts/template.js";
import { canonicalJsonSha256 } from "../platform/serialization/canonical-json.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import type { PolicyWorkspace } from "../workspace/types.js";
import { validateWorkspace } from "../workspace/workspace-validation.js";
import { assuranceApplicability } from "./assurance-applicability.js";
import { assuranceConfigurationChanges } from "./assurance-configuration-diff.js";
import type {
  AssuranceCatalogBundle,
  AssuranceConflict,
  AssuranceConflictDecision,
  AssuranceConstraint,
  AssurancePreset,
  AssurancePresetSelection,
  AssuranceRecommendation,
  AssuranceRetainedValue,
  AssuranceReviewReceipt,
  AssuranceSelectionApplyRequest,
  AssuranceSelectionApplyResponse,
  AssuranceSelectionExclusion,
  AssuranceSelectionPreview,
  AssuranceSelectionRequest,
} from "./assurance-contracts.js";
import { assuranceCreationOptions } from "./assurance-deterministic-values.js";
import { assuranceMappingKey, applyAssuranceMappingValues, currentAssuranceMappingValues } from "./assurance-mapping-target.js";
import { assuranceSetValueAtPointer, assuranceValueAtPointer } from "./assurance-json.js";
import { validateParameterValue } from "./assurance-catalog-validation.js";
import { selectedPolicyTarget } from "./compliance-policy-target.js";
import { assertAssuranceMappingSchema } from "./assurance-mapping-schema.js";

export interface AssuranceSelectionDependencies {
  readonly catalog: AssuranceCatalogBundle;
  readonly bundle: RelutionTemplateBundle;
  readonly appleSchema: AppleSchemaCatalog;
  readonly workspaceRevision: string;
}

interface ResolvedRecommendation {
  readonly recommendation: AssuranceRecommendation;
  readonly values: JsonRecord;
  readonly constraints: readonly AssuranceConstraint[];
}

interface MappingRequirement {
  readonly recommendationId: string;
  readonly constraint: AssuranceConstraint;
  readonly desired: unknown;
}

interface SelectedRecommendation {
  readonly recommendation: AssuranceRecommendation;
  readonly presetSelection?: AssurancePresetSelection;
}

export function prepareAssuranceSelection(
  input: AssuranceSelectionRequest,
  dependencies: AssuranceSelectionDependencies,
): { readonly workspace: PolicyWorkspace; readonly preview: AssuranceSelectionPreview } {
  if (input.expectedRevision !== dependencies.workspaceRevision) throw new Error("Assurance workspace revision changed before preview");
  const validation = validateWorkspace(input.workspace, dependencies.bundle);
  if (!validation.ok) throw new Error("Assurance selection requires a valid workspace draft");
  const workspace = structuredClone(input.workspace);
  const target = selectedPolicyTarget(workspace, resolvePolicySelection(workspace, input.target));
  const selected = resolveSelection(input, dependencies.catalog);
  validateExplicitExclusions(input.exclusions ?? [], selected.recommendations);
  const explicitExclusions = new Map((input.exclusions ?? []).map((entry) => [entry.recommendationId, entry.reason]));
  const exclusions: AssuranceSelectionExclusion[] = [...selected.presetExclusions];
  const unresolvedApplicability: AssuranceSelectionExclusion[] = [];
  const applicable: SelectedRecommendation[] = [];
  for (const entry of selected.recommendations) {
    const explicit = explicitExclusions.get(entry.recommendation.id);
    if (explicit !== undefined) {
      exclusions.push({ recommendationId: entry.recommendation.id, reason: explicit });
      continue;
    }
    const result = assuranceApplicability(entry.recommendation, target.policyPlatform, input.applicability ?? {});
    if (!result.applies) {
      const exclusion = { recommendationId: entry.recommendation.id, reason: result.reason ?? "Recommendation is not applicable" };
      exclusions.push(exclusion);
      if (entry.recommendation.platform === target.policyPlatform
        && (result.reason?.startsWith("Missing applicability") || result.reason?.includes("unresolved"))) unresolvedApplicability.push(exclusion);
    }
    else applicable.push(entry);
  }
  const parameterIds = new Set(selected.recommendations.flatMap((entry) => entry.recommendation.parameters.map((parameter) => parameter.id)));
  for (const id of Object.keys(input.parameters ?? {})) if (!parameterIds.has(id)) throw new Error(`Unknown assurance parameter: ${id}`);
  const unresolvedParameters: string[] = [];
  const resolved = applicable.flatMap((entry) => {
    const resolution = resolveRecommendation(entry, input.parameters ?? {}, unresolvedParameters);
    return resolution === undefined ? [] : [resolution];
  });
  const decisions = validateDecisions(input.decisions ?? []);
  const draftDigest = canonicalJsonSha256(input.workspace);
  const planned = planMappings(target.configurations, resolved, decisions, dependencies, draftDigest, target.policy.document.creationDate, target.policyPlatform);
  const usedDecisionPaths = new Set(planned.conflicts.flatMap((conflict) => conflict.resolvedBy === undefined ? [] : [conflict.path]));
  for (const decision of decisions) if (!usedDecisionPaths.has(decision.path)) throw new Error(`Assurance conflict decision does not match a current conflict: ${decision.path}`);
  const sourceDigests = selectedSourceDigests(selected.recommendations, dependencies.catalog);
  const acknowledged = uniqueStrings(input.acknowledgedSourceDigests ?? []);
  for (const digest of acknowledged) if (!Object.values(sourceDigests).includes(digest)) throw new Error(`Acknowledged source digest is not selected: ${digest}`);
  const unacknowledgedSourceDigests = Object.values(sourceDigests).filter((digest) => !acknowledged.includes(digest));
  const readinessReview = validateReadinessReview(input, selected.preset);
  const unresolvedConflicts = planned.conflicts.some((conflict) => conflict.resolvedBy === undefined);
  const selectedRecommendationId = input.selection.kind === "recommendation" ? input.selection.recommendationId : undefined;
  const exactRecommendationExcluded = selectedRecommendationId !== undefined && exclusions.some((entry) => entry.recommendationId === selectedRecommendationId);
  const ready = !exactRecommendationExcluded
    && resolved.length > 0
    && unresolvedParameters.length === 0
    && unresolvedApplicability.length === 0
    && !unresolvedConflicts
    && unacknowledgedSourceDigests.length === 0
    && (!selected.requiresReadinessReview || readinessReview !== undefined);
  if (!validateWorkspace(workspace, dependencies.bundle).ok) throw new Error("Assurance selection produced an invalid workspace draft");
  const resultDigest = canonicalJsonSha256(workspace);
  const previewBase = {
    ready,
    workspaceRevision: dependencies.workspaceRevision,
    draftDigest,
    resultDigest,
    assuranceDigest: dependencies.catalog.assuranceDigest,
    snapshotDigest: dependencies.catalog.snapshotDigest,
    snapshotSelection: input.snapshotDigest === undefined ? "current" : "retained",
    sourceDigests,
    ...(input.selection.kind === "preset" ? { presetDigest: dependencies.catalog.presetDigest } : {}),
    selection: input.selection,
    recommendationIds: selected.recommendations.map((entry) => entry.recommendation.id),
    changes: planned.changes,
    retained: planned.retained,
    exclusions,
    conflicts: planned.conflicts,
    decisions,
    obligations: uniqueStrings([
      ...organizationalObligations(selected.presetExclusions, dependencies.catalog, target.policyPlatform),
      ...validateMeaningfulStrings(input.obligations ?? [], "assurance obligation"),
    ]),
    exceptions: validateMeaningfulStrings(input.exceptions ?? [], "assurance exception"),
    acknowledgedSourceDigests: acknowledged,
    unacknowledgedSourceDigests,
    unresolvedParameters: uniqueStrings(unresolvedParameters),
    unresolvedApplicability,
    ...(readinessReview === undefined ? {} : { readinessReview }),
  } satisfies Omit<AssuranceSelectionPreview, "previewDigest">;
  const preview: AssuranceSelectionPreview = { ...previewBase, previewDigest: canonicalJsonSha256(previewBase) };
  return { workspace, preview };
}

export function applyPreparedAssuranceSelection(
  input: AssuranceSelectionApplyRequest,
  dependencies: AssuranceSelectionDependencies,
): AssuranceSelectionApplyResponse {
  const prepared = prepareAssuranceSelection(input, dependencies);
  const preview = prepared.preview;
  assertEqual(input.draftDigest, preview.draftDigest, "draft digest");
  assertEqual(input.resultDigest, preview.resultDigest, "result digest");
  assertEqual(input.previewDigest, preview.previewDigest, "preview digest");
  assertEqual(input.assuranceDigest, preview.assuranceDigest, "assurance digest");
  assertEqual(input.resolvedSnapshotDigest, preview.snapshotDigest, "snapshot digest");
  if (input.snapshotSelection !== preview.snapshotSelection) throw new Error("Assurance snapshot selection changed after preview");
  if (!isDeepStrictEqual(input.sourceDigests, preview.sourceDigests)) throw new Error("Assurance source digests changed after preview");
  if (input.presetDigest !== preview.presetDigest) throw new Error("Assurance preset digest changed after preview");
  if (!preview.ready) throw new Error("Assurance preview is not ready to apply");
  return {
    workspace: prepared.workspace,
    revision: dependencies.workspaceRevision,
    preview,
    receipt: receiptFromPreview(preview),
  };
}

function resolveSelection(input: AssuranceSelectionRequest, catalog: AssuranceCatalogBundle): {
  readonly recommendations: readonly SelectedRecommendation[];
  readonly presetExclusions: readonly AssuranceSelectionExclusion[];
  readonly preset?: AssurancePreset;
  readonly requiresReadinessReview: boolean;
} {
  const byId = new Map(catalog.catalog.recommendations.map((entry) => [entry.id, entry]));
  if (input.selection.kind === "recommendation") {
    const recommendation = byId.get(input.selection.recommendationId);
    if (recommendation?.selectable !== true) throw new Error(`Assurance recommendation is not selectable: ${input.selection.recommendationId}`);
    return { recommendations: [{ recommendation }], presetExclusions: [], requiresReadinessReview: false };
  }
  const presetSelection = input.selection;
  const preset = catalog.presets.presets.find((entry) => entry.id === presetSelection.presetId && entry.version === presetSelection.presetVersion);
  if (preset === undefined) throw new Error(`Assurance preset not found: ${presetSelection.presetId}@${presetSelection.presetVersion}`);
  const chain = presetChain(preset, catalog.presets.presets);
  const selections = new Map<string, AssurancePresetSelection>();
  for (const member of chain) {
    for (const selection of member.selections) {
      const inherited = selections.get(selection.recommendationId);
      selections.set(selection.recommendationId, inherited === undefined ? selection : mergePresetSelection(inherited, selection, byId.get(selection.recommendationId)!));
    }
  }
  const recommendations = [...selections.values()].map((presetSelection) => {
    const recommendation = byId.get(presetSelection.recommendationId);
    if (recommendation?.selectable !== true) throw new Error(`Assurance preset selects unavailable recommendation ${presetSelection.recommendationId}`);
    return { recommendation, presetSelection };
  });
  return {
    recommendations,
    presetExclusions: preset.exclusions.filter((exclusion) => !selections.has(exclusion.recommendationId)),
    preset,
    requiresReadinessReview: chain.some((member) => member.requiresReadinessReview),
  };
}

function mergePresetSelection(parent: AssurancePresetSelection, child: AssurancePresetSelection, recommendation: AssuranceRecommendation): AssurancePresetSelection {
  for (const [path, value] of Object.entries(child.fixedValues)) {
    const inheritedValue = Object.hasOwn(parent.fixedValues, path)
      ? parent.fixedValues[path]
      : assuranceValueAtPointer(recommendation.mapping!.values, path);
    if (!isDeepStrictEqual(value, inheritedValue)) requireMeaningful(child.overrideJustifications[path] ?? "", `Inherited value override rationale for ${path}`, 12);
  }
  for (const [id, value] of Object.entries(child.parameterDefaults)) {
    const parameter = recommendation.parameters.find((entry) => entry.id === id);
    const inheritedValue = Object.hasOwn(parent.parameterDefaults, id)
      ? parent.parameterDefaults[id]
      : parameter?.defaultValue;
    if (!isDeepStrictEqual(value, inheritedValue)) requireMeaningful(parameter === undefined ? "" : child.overrideJustifications[parameter.path] ?? "", `Inherited parameter override rationale for ${id}`, 12);
  }
  return { recommendationId: child.recommendationId, fixedValues: { ...parent.fixedValues, ...child.fixedValues }, parameterDefaults: { ...parent.parameterDefaults, ...child.parameterDefaults }, settingRationales: { ...parent.settingRationales, ...child.settingRationales }, overrideJustifications: { ...parent.overrideJustifications, ...child.overrideJustifications } };
}

function presetChain(preset: AssurancePreset, presets: readonly AssurancePreset[]): AssurancePreset[] {
  const byId = new Map(presets.map((entry) => [entry.id, entry]));
  const chain: AssurancePreset[] = [];
  let current: AssurancePreset | undefined = preset;
  while (current !== undefined) {
    chain.unshift(current);
    current = current.inherits === null ? undefined : byId.get(current.inherits);
  }
  return chain;
}

function resolveRecommendation(
  selected: SelectedRecommendation,
  suppliedParameters: Readonly<Record<string, unknown>>,
  unresolved: string[],
): ResolvedRecommendation | undefined {
  const mapping = selected.recommendation.mapping!;
  const values = structuredClone(mapping.values) as JsonRecord;
  for (const [path, value] of Object.entries(selected.presetSelection?.fixedValues ?? {})) assuranceSetValueAtPointer(values, path, value);
  let missing = false;
  const presetDefaults = selected.presetSelection?.parameterDefaults ?? {};
  for (const parameter of selected.recommendation.parameters) {
    const supplied = suppliedParameters[parameter.id];
    const value = supplied ?? presetDefaults[parameter.id] ?? parameter.defaultValue;
    if (value === undefined) {
      if (parameter.required) { unresolved.push(parameter.id); missing = true; }
      continue;
    }
    if (Object.hasOwn(selected.presetSelection?.fixedValues ?? {}, parameter.path)) throw new Error(`Assurance parameter overlaps a fixed preset value: ${parameter.id}`);
    validateParameterValue(parameter, value);
    assuranceSetValueAtPointer(values, parameter.path, value);
  }
  if (missing) return undefined;
  for (const constraint of selected.recommendation.constraints) {
    const desired = assuranceValueAtPointer(values, constraint.path);
    if (desired === undefined) throw new Error(`Assurance mapping value is unresolved: ${selected.recommendation.id}${constraint.path}`);
    if (!satisfiesSourceConstraint(constraint, desired)) {
      throw new Error(`Assurance mapping value violates its source constraint: ${selected.recommendation.id}${constraint.path}`);
    }
  }
  return { recommendation: selected.recommendation, values, constraints: selected.recommendation.constraints };
}

function planMappings(
  configurations: JsonRecord[],
  recommendations: readonly ResolvedRecommendation[],
  decisions: readonly AssuranceConflictDecision[],
  dependencies: AssuranceSelectionDependencies,
  draftDigest: string,
  policyDate: unknown,
  platform: string,
): { readonly changes: AssuranceSelectionPreview["changes"]; readonly retained: readonly AssuranceRetainedValue[]; readonly conflicts: readonly AssuranceConflict[] } {
  const groups = new Map<string, ResolvedRecommendation[]>();
  for (const recommendation of recommendations) {
    const key = assuranceMappingKey(recommendation.recommendation.mapping!);
    groups.set(key, [...(groups.get(key) ?? []), recommendation]);
  }
  const changes: AssuranceSelectionPreview["changes"][number][] = [];
  const retained: AssuranceRetainedValue[] = [];
  const conflicts: AssuranceConflict[] = [];
  for (const [key, group] of groups) {
    const mapping = group[0]!.recommendation.mapping!;
    const current = currentAssuranceMappingValues(configurations, mapping, dependencies.appleSchema);
    const plannedValues: JsonRecord = {};
    const paths = new Set(group.flatMap((entry) => entry.constraints.map((constraint) => constraint.path)));
    for (const path of [...paths].sort()) {
      const requirements: MappingRequirement[] = group.flatMap((entry) => entry.constraints
        .filter((constraint) => constraint.path === path)
        .map((constraint) => ({ recommendationId: entry.recommendation.id, constraint, desired: assuranceValueAtPointer(entry.values, path) })));
      const actual = assuranceValueAtPointer(current, path);
      const decisionPath = `${key}${path}`;
      const compatible = compatibleValue(actual, requirements);
      const decision = compatible.found ? undefined : decisions.find((entry) => entry.path === decisionPath);
      let value = compatible.value;
      if (!compatible.found) {
        const conflict: AssuranceConflict = {
          path: decisionPath,
          recommendationIds: requirements.map((entry) => entry.recommendationId),
          values: requirements.map((entry) => entry.desired),
          ...(decision === undefined ? {} : { resolvedBy: decision }),
        };
        conflicts.push(conflict);
        const winner = decision === undefined ? requirements[0]! : requirements.find((entry) => entry.recommendationId === decision.winnerRecommendationId);
        if (winner === undefined) throw new Error(`Assurance conflict winner is not a conflicting recommendation: ${decision!.winnerRecommendationId}`);
        value = actual !== undefined && satisfiesRequested(winner, actual) ? actual : winner.desired;
      }
      if (value === undefined) throw new Error(`Assurance mapping has no value for ${decisionPath}`);
      const recommendationIds = requirements.map((entry) => entry.recommendationId);
      if (actual !== undefined && compatible.found && compatible.usedExisting) {
        const reason = strictlyStrongerThanRequested(actual, requirements) ? "stronger-existing" : "already-satisfies";
        retained.push({ recommendationIds, family: mapping.family, target: mapping.target, path, value: actual, reason });
      }
      assuranceSetValueAtPointer(plannedValues, path, compatible.found && compatible.usedExisting ? actual : value);
    }
    const before = structuredClone(configurations);
    assertAssuranceMappingSchema(mapping, plannedValues, platform, dependencies.bundle, dependencies.appleSchema);
    applyAssuranceMappingValues(configurations, mapping, plannedValues, dependencies.bundle, dependencies.appleSchema, assuranceCreationOptions(`${draftDigest}:${key}`, policyDate));
    changes.push(...assuranceConfigurationChanges(before, configurations, mapping, group.map((entry) => entry.recommendation.id)));
  }
  return { changes, retained, conflicts };
}

function compatibleValue(
  actual: unknown,
  requirements: readonly MappingRequirement[],
): { readonly found: boolean; readonly value?: unknown; readonly usedExisting: boolean } {
  if (actual !== undefined && requirements.every((entry) => satisfiesRequested(entry, actual))) {
    return { found: true, value: actual, usedExisting: true };
  }
  if (requirements.every((entry) => entry.constraint.operator === "containsAll" && Array.isArray(entry.desired))) {
    const union = uniqueValues([...(Array.isArray(actual) ? actual : []), ...requirements.flatMap((entry) => entry.desired as unknown[])]);
    return { found: true, value: union, usedExisting: false };
  }
  const candidates = requirements.flatMap((entry) => entry.constraint.operator === "oneOf" && Array.isArray(entry.constraint.value)
    ? [entry.desired, ...entry.constraint.value]
    : [entry.desired, entry.constraint.value]);
  const match = candidates.find((candidate) => candidate !== undefined && requirements.every((entry) => satisfiesRequested(entry, candidate)));
  return match === undefined ? { found: false, usedExisting: false } : { found: true, value: match, usedExisting: false };
}

function satisfiesSourceConstraint(constraint: AssuranceConstraint, value: unknown): boolean {
  if (constraint.operator === "equals") return isDeepStrictEqual(value, constraint.value);
  if (constraint.operator === "oneOf") return Array.isArray(constraint.value) && constraint.value.some((candidate) => isDeepStrictEqual(candidate, value));
  if (constraint.operator === "containsAll") {
    return Array.isArray(value)
      && Array.isArray(constraint.value)
      && constraint.value.every((required) => value.some((candidate) => isDeepStrictEqual(candidate, required)));
  }
  if (typeof value !== "number" || typeof constraint.value !== "number") return false;
  return constraint.operator === "atLeast" ? value >= constraint.value : constraint.operator === "atMost" && value <= constraint.value;
}

function satisfiesRequested(requirement: MappingRequirement, value: unknown): boolean {
  const { constraint, desired } = requirement;
  if (constraint.operator === "equals") return isDeepStrictEqual(value, desired);
  if (constraint.operator === "oneOf") return satisfiesSourceConstraint(constraint, value);
  if (constraint.operator === "containsAll") {
    return Array.isArray(value)
      && Array.isArray(desired)
      && desired.every((required) => value.some((candidate) => isDeepStrictEqual(candidate, required)));
  }
  if (typeof value !== "number" || typeof desired !== "number") return false;
  return constraint.operator === "atLeast" ? value >= desired : value <= desired;
}

function strictlyStrongerThanRequested(actual: unknown, requirements: readonly MappingRequirement[]): boolean {
  return requirements.some(({ constraint, desired }) => {
    if (constraint.operator === "atLeast") return typeof actual === "number" && typeof desired === "number" && actual > desired;
    if (constraint.operator === "atMost") return typeof actual === "number" && typeof desired === "number" && actual < desired;
    if (constraint.operator === "containsAll") return Array.isArray(actual) && Array.isArray(desired) && actual.length > desired.length;
    return false;
  });
}

function uniqueValues(values: readonly unknown[]): unknown[] {
  return values.filter((value, index) => values.findIndex((candidate) => isDeepStrictEqual(candidate, value)) === index);
}

function selectedSourceDigests(
  recommendations: readonly SelectedRecommendation[],
  catalog: AssuranceCatalogBundle,
): Readonly<Record<string, string>> {
  const sourceIds = new Set(recommendations.flatMap((entry) => entry.recommendation.provenance.evidence));
  return Object.fromEntries(Object.entries(catalog.sourceDigests).filter(([sourceId]) => sourceIds.has(sourceId)));
}

function organizationalObligations(exclusions: readonly AssuranceSelectionExclusion[], catalog: AssuranceCatalogBundle, platform: string): string[] {
  const excludedIds = new Set(exclusions.map((entry) => entry.recommendationId));
  return catalog.catalog.recommendations.filter((entry) => excludedIds.has(entry.id) && entry.disposition === "organizational" && entry.platform === platform)
    .map((entry) => `${entry.id}: ${entry.title}${entry.rationale === null ? "" : `. ${entry.rationale}`}`);
}

function validateExplicitExclusions(exclusions: readonly AssuranceSelectionExclusion[], selected: readonly SelectedRecommendation[]): void {
  const selectedIds = new Set(selected.map((entry) => entry.recommendation.id));
  for (const exclusion of exclusions) {
    if (!selectedIds.has(exclusion.recommendationId)) throw new Error(`Assurance exclusion is not selected: ${exclusion.recommendationId}`);
    requireMeaningful(exclusion.reason, "Assurance exclusion reason");
  }
}

function validateDecisions(decisions: readonly AssuranceConflictDecision[]): AssuranceConflictDecision[] {
  const paths = new Set<string>();
  return decisions.map((decision) => {
    if (paths.has(decision.path)) throw new Error(`Duplicate assurance conflict decision: ${decision.path}`);
    paths.add(decision.path);
    requireMeaningful(decision.path, "Assurance conflict path");
    requireMeaningful(decision.winnerRecommendationId, "Assurance conflict winner");
    requireMeaningful(decision.rationale, "Assurance conflict rationale", 12);
    return decision;
  });
}

function validateReadinessReview(
  input: AssuranceSelectionRequest,
  preset: AssurancePreset | undefined,
): AssuranceSelectionPreview["readinessReview"] {
  const review = input.readinessReview;
  if (review !== undefined) {
    if (review.reviewed !== true) throw new Error("Assurance readiness review must be explicitly reviewed");
    requireMeaningful(review.rationale, "Assurance readiness rationale", 20);
  }
  if (preset?.requiresReadinessReview === true && review === undefined) return undefined;
  return review;
}

function validateMeaningfulStrings(values: readonly string[], label: string): string[] {
  return uniqueStrings(values.map((value) => requireMeaningful(value, label)));
}

function requireMeaningful(value: string, label: string, minimumLength = 1): string {
  if (typeof value !== "string" || value.trim().length < minimumLength) throw new Error(`${label} must contain at least ${String(minimumLength)} characters`);
  return value.trim();
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function resolvePolicySelection(workspace: PolicyWorkspace, target: AssuranceSelectionRequest["target"]): { readonly policyIndex: number; readonly versionIndex: number } {
  const policyIndex = workspace.policies.findIndex((policy) => policy.path === target.policyPath);
  if (policyIndex < 0) throw new Error(`Assurance policy not found: ${target.policyPath}`);
  return { policyIndex, versionIndex: target.versionIndex };
}

function receiptFromPreview(preview: AssuranceSelectionPreview): AssuranceReviewReceipt {
  return {
    version: 1,
    workspaceRevision: preview.workspaceRevision,
    draftDigest: preview.draftDigest,
    resultDigest: preview.resultDigest,
    selection: preview.selection,
    recommendationIds: preview.recommendationIds,
    previewDigest: preview.previewDigest,
    assuranceDigest: preview.assuranceDigest,
    snapshotDigest: preview.snapshotDigest,
    snapshotSelection: preview.snapshotSelection,
    sourceDigests: preview.sourceDigests,
    ...(preview.presetDigest === undefined ? {} : { presetDigest: preview.presetDigest }),
    changes: preview.changes,
    retained: preview.retained,
    exclusions: preview.exclusions,
    conflicts: preview.conflicts,
    decisions: preview.decisions,
    obligations: preview.obligations,
    exceptions: preview.exceptions,
    acknowledgedSourceDigests: preview.acknowledgedSourceDigests,
    ...(preview.readinessReview === undefined ? {} : { readinessReview: preview.readinessReview }),
  };
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`Assurance ${label} changed after preview`);
}

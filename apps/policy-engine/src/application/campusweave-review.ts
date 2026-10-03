/** Builds a digest-bound local review package without granting operational authority. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import { canonicalJsonSha256 } from "../platform/serialization/canonical-json.js";
import type { CampusWeaveMapping, CampusWeaveProject, CampusWeaveReview, CampusWeaveReviewMapping } from "../contracts/campusweave.js";
import { campusWeaveProfileDigest } from "../contracts/campusweave-validation.js";

interface CampusWeaveReviewWorkspaceState {
  readonly available: boolean;
  readonly policyRevision?: string;
  readonly artifact?: {
    readonly policyRevision: string;
    readonly artifactDigest: string;
    readonly catalogDigest: string;
    readonly assuranceDigest?: string;
  };
}

export interface CampusWeaveReviewCurrentState {
  readonly catalogDigest?: string;
  readonly assuranceDigest?: string;
  readonly mappingReasons?: ReadonlyMap<number, string>;
  readonly workspaces?: ReadonlyMap<string, CampusWeaveReviewWorkspaceState>;
  /** Result freshly compiled by the trusted Python worker, never supplied by the client. */
  readonly trustedCompilation?: JsonRecord;
}

const OPERATIONAL_REQUIREMENTS = [
  { id: "target-contract", kind: "target", label: "Target contract" },
  { id: "inventory-scope", kind: "target", label: "Inventory-backed scope" },
  { id: "physical-device", kind: "device", label: "Physical-device results" },
  { id: "recovery", kind: "recovery", label: "Recovery evidence" },
] as const;

export function reviewCampusWeaveProject(
  project: CampusWeaveProject,
  current: CampusWeaveReviewCurrentState = {},
): CampusWeaveReview {
  const profileDigest = campusWeaveProfileDigest(project.profile);
  const compilationReasons = reviewCompilation(project, profileDigest, current);
  const conflicts = ownershipConflicts(project.mappings);
  const conflictingKeys = new Set(conflicts.map((entry) => String(entry.setting_key)));
  const mappings = project.mappings.map((mapping, index) => reviewMapping(
    project, mapping, index, profileDigest, conflictingKeys, current, compilationReasons,
  ));
  const evidence = project.evidence.map((entry, index) => ({
    ...entry, evidence_index: index, current: evidenceReasons(entry, project, profileDigest, current).length === 0,
    assurance_currency: entry.assurance_digest === undefined || current.assuranceDigest === undefined ? "unknown"
      : entry.assurance_digest === current.assuranceDigest ? "current" : "stale",
    reasons: evidenceReasons(entry, project, profileDigest, current),
  }));
  const intents = project.profile.intents.filter(isRecord);
  const unresolved: unknown[] = [
    ...project.profile.unresolved,
    ...project.operations.filter((operation) => operation.status !== "committed").map((operation) => ({ code: "operation_incomplete", operation_id: operation.id, message: "A workspace operation needs recovery before review" })),
    ...compilationReasons.map((message) => ({ code: "compilation_not_current", message })),
    ...(intents.length === 0 ? [{ code: "planning_empty", message: "No policy intent has been defined" }] : []),
    ...intents.filter((intent) => !project.mappings.some((mapping) => mapping.intent_id === intent.id))
      .map((intent) => ({ code: "intent_unmapped", intent_id: intent.id, message: "Intent has no reviewed policy mapping" })),
    ...mappings.flatMap((mapping) => mapping.reasons.map((message) => ({
      code: "mapping_not_projectable", mapping_index: mapping.mapping_index, intent_id: mapping.intent_id, message,
    }))),
    ...conflicts.map((conflict) => ({ code: "conflicting_setting_ownership", ...conflict })),
    ...missingEvidence(project, evidence, intents),
    ...OPERATIONAL_REQUIREMENTS.filter((requirement) => !evidence.some((entry) =>
      entry.current && entry.kind === requirement.kind && entry.requirement_id === requirement.id,
    )).map((requirement) => ({ code: "operational_evidence_missing", requirement_id: requirement.id, message: `${requirement.label} is not evidenced by a current reference` })),
  ];
  return {
    project_id: project.id, revision: project.revision, profile_digest: profileDigest,
    complete: unresolved.length === 0, execution_authorized: false, deployment_authorized: false,
    verification_scope: "Local compilation, artifact integrity and evidence references; external evidence claims require human review",
    mappings, unresolved, conflicts, evidence,
    project,
    artifact_manifest: [...(current.workspaces ?? new Map())].map(([workspace_id, state]) => ({
      workspace_id, available: state.available, policy_revision: state.policyRevision ?? null, artifact: state.artifact ?? null,
    })),
    trusted_compilation: current.trustedCompilation ?? null,
    assurance_digest: current.assuranceDigest ?? null,
    assurance_reviews: project.assurance_reviews ?? [],
  };
}

function reviewCompilation(project: CampusWeaveProject, profileDigest: string, current: CampusWeaveReviewCurrentState): string[] {
  const reasons: string[] = [];
  const saved = project.compiled_plan;
  const trusted = current.trustedCompilation;
  if (saved === null) reasons.push("Compile the profile before review");
  if (trusted === undefined) reasons.push("Current planner validation is unavailable");
  if (trusted?.valid !== true) reasons.push("Current profile has unresolved compilation diagnostics");
  if (trusted?.profile_digest !== profileDigest) reasons.push("Current compiler profile digest does not match the profile");
  if (saved !== null && (saved.profile_digest !== profileDigest || saved.valid !== true)) reasons.push("Saved compilation is stale or invalid");
  if (saved !== null && (saved.plan_digest !== trusted?.plan_digest || !isRecord(saved.plan)
    || canonicalJsonSha256(saved.plan) !== saved.plan_digest)) reasons.push("Saved plan differs from deterministic compilation");
  if (current.catalogDigest === undefined || saved?.catalog_digest !== current.catalogDigest) reasons.push("Saved reference catalog digest is stale or missing");
  return reasons;
}

function reviewMapping(
  project: CampusWeaveProject, mapping: CampusWeaveMapping, index: number, profileDigest: string,
  conflictingKeys: ReadonlySet<string>, current: CampusWeaveReviewCurrentState, compilationReasons: readonly string[],
): CampusWeaveReviewMapping {
  const reasons = [...compilationReasons];
  const schemaReason = current.mappingReasons?.get(index);
  if (schemaReason !== undefined) reasons.push(schemaReason);
  if (!mapping.reviewed) reasons.push("Mapping is not reviewed");
  if (!project.profile.intents.some((intent) => isRecord(intent) && intent.id === mapping.intent_id)) reasons.push("Intent reference is missing");
  if (mapping.profile_digest !== profileDigest) reasons.push("Mapping profile digest is stale");
  if (!project.workspace_refs.some((workspace) => workspace.id === mapping.workspace_id)) reasons.push("Workspace reference is missing");
  const workspace = current.workspaces?.get(mapping.workspace_id);
  if (workspace?.available !== true || workspace.policyRevision === undefined) reasons.push("Authoritative workspace is unavailable");
  else if (mapping.policy_revision !== workspace.policyRevision) reasons.push("Mapping policy revision is stale");
  if (conflictingKeys.has(mappingSettingKey(mapping))) reasons.push("Setting ownership conflicts with another intent");
  return { mapping_index: index, intent_id: mapping.intent_id, current: reasons.length === 0,
    reviewed: mapping.reviewed, projectable: reasons.length === 0, reasons };
}

function evidenceReasons(entry: JsonRecord, project: CampusWeaveProject, profileDigest: string, current: CampusWeaveReviewCurrentState): string[] {
  const reasons: string[] = [];
  if (!project.profile.intents.some((intent) => isRecord(intent) && intent.id === entry.intent_id)) reasons.push("Evidence intent reference is missing");
  if (!["local", "target", "device", "recovery"].includes(String(entry.kind))) reasons.push("Evidence class is unresolved");
  if (entry.profile_digest !== profileDigest) reasons.push("Evidence profile digest is stale");
  if (entry.catalog_digest !== current.catalogDigest) reasons.push("Evidence catalog digest is stale");
  if (entry.assurance_digest === undefined || current.assuranceDigest === undefined) reasons.push("Evidence assurance currency is unknown: digest binding is missing");
  else if (entry.assurance_digest !== current.assuranceDigest) reasons.push("Evidence assurance digest is stale");
  const workspace = typeof entry.workspace_id === "string" ? current.workspaces?.get(entry.workspace_id) : undefined;
  if (workspace?.available !== true || workspace.policyRevision !== entry.policy_revision) reasons.push("Evidence workspace revision is stale or unavailable");
  const artifact = workspace?.artifact;
  if (artifact === undefined || artifact.artifactDigest !== entry.artifact_digest
    || artifact.policyRevision !== entry.policy_revision || artifact.catalogDigest !== entry.catalog_digest) reasons.push("Artifact evidence is missing or stale");
  if (entry.assurance_digest !== undefined && artifact?.assuranceDigest !== entry.assurance_digest) reasons.push("Artifact assurance binding is missing or stale");
  return reasons;
}

function missingEvidence(project: CampusWeaveProject, evidence: readonly JsonRecord[], intents: readonly JsonRecord[]): JsonRecord[] {
  return project.mappings.flatMap((mapping) => {
    const intent = intents.find((candidate) => candidate.id === mapping.intent_id);
    const requirements = Array.isArray(intent?.requirements) ? intent.requirements.filter((item): item is string => typeof item === "string") : [];
    const currentEvidence = evidence.filter((entry) => entry.current === true && entry.intent_id === mapping.intent_id && entry.workspace_id === mapping.workspace_id);
    const missing = requirements.filter((requirement) => !currentEvidence.some((entry) => entry.requirement_id === requirement));
    if (currentEvidence.length === 0 && missing.length === 0) missing.push("local-policy-validation");
    return missing.map((requirement_id) => ({ code: "intent_evidence_missing", intent_id: mapping.intent_id,
      workspace_id: mapping.workspace_id, requirement_id, message: "Requirement has no current evidence reference for this intent and workspace" }));
  });
}

function ownershipConflicts(mappings: readonly CampusWeaveMapping[]): JsonRecord[] {
  const ownership = new Map<string, { setting_key: string; intent_ids: string[]; values: string[] }>();
  for (const mapping of mappings) {
    const key = mappingSettingKey(mapping);
    const value = canonicalJsonSha256(mapping.value);
    const entry = ownership.get(key) ?? { setting_key: key, intent_ids: [], values: [] };
    if (!entry.intent_ids.includes(mapping.intent_id)) entry.intent_ids.push(mapping.intent_id);
    if (!entry.values.includes(value)) entry.values.push(value);
    ownership.set(key, entry);
  }
  return [...ownership.values()].filter((entry) => entry.intent_ids.length > 1 || entry.values.length > 1);
}
function mappingSettingKey(mapping: CampusWeaveMapping): string { return [mapping.workspace_id, mapping.policy_id, mapping.configuration_id, mapping.field].join("\u0000"); }
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }

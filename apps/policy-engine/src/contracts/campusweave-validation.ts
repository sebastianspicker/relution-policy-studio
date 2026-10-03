/** Validates persisted CampusWeave project documents at their trust boundary. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import { canonicalJsonSha256 } from "../platform/serialization/canonical-json.js";
import type {
  CampusWeaveEvidence,
  CampusWeaveMapping,
  CampusWeaveProfile,
  CampusWeaveProject,
  CampusWeaveWorkspaceRef,
} from "./campusweave.js";
import { CampusWeaveInputError } from "./campusweave-errors.js";

export const CAMPUSWEAVE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const RESERVED_PROFILE_KEYS = new Set([
  "api_key", "authority", "authority_id", "credential", "credentials", "host", "hostname",
  "password", "secret", "target", "target_id", "target_url", "tenant", "token", "url",
]);

export function parseCampusWeaveProject(value: unknown): CampusWeaveProject {
  const project = record(value, "project");
  if (project.schema_version !== 1) throw inputError("project.schema_version must be 1");
  const parsed: CampusWeaveProject = {
    schema_version: 1,
    id: identifier(project.id, "project.id"),
    name: nonEmptyString(project.name, "project.name", 160),
    revision: revision(project.revision, "project.revision"),
    profile: parseCampusWeaveProfile(project.profile),
    compiled_plan: nullableRecord(project.compiled_plan, "project.compiled_plan"),
    mappings: array(project.mappings, "project.mappings", 10_000).map(parseMapping),
    workspace_refs: array(project.workspace_refs, "project.workspace_refs", 256).map(parseWorkspaceRef),
    evidence: array(project.evidence, "project.evidence", 10_000).map(parseEvidence),
    operations: array(project.operations, "project.operations", 10_000).map((entry, index) => record(entry, `project.operations[${String(index)}]`)),
    ...(project.assurance_reviews === undefined ? {} : {
      assurance_reviews: array(project.assurance_reviews, "project.assurance_reviews", 1_000)
        .map((entry, index) => record(entry, `project.assurance_reviews[${String(index)}]`)),
    }),
  };
  assertUniqueIds(parsed.workspace_refs, "workspace reference");
  return parsed;
}

export function parseCampusWeaveProfile(value: unknown): CampusWeaveProfile {
  const profile = record(value, "project.profile");
  rejectReservedProfileData(profile, "project.profile");
  if (profile.schema_version !== 2) throw inputError("project.profile.schema_version must be 2");
  return {
    ...profile,
    schema_version: 2,
    id: nonEmptyString(profile.id, "project.profile.id", 256),
    name: nonEmptyString(profile.name, "project.profile.name", 160),
    organizations: array(profile.organizations, "project.profile.organizations", 10_000),
    locations: array(profile.locations, "project.profile.locations", 10_000),
    cohorts: array(profile.cohorts, "project.profile.cohorts", 10_000),
    intents: array(profile.intents, "project.profile.intents", 10_000),
    scope_blueprints: array(profile.scope_blueprints, "project.profile.scope_blueprints", 10_000),
    assignments: array(profile.assignments, "project.profile.assignments", 10_000),
    rollout_stages: array(profile.rollout_stages, "project.profile.rollout_stages", 10_000),
    unresolved: array(profile.unresolved, "project.profile.unresolved", 10_000),
  };
}

function rejectReservedProfileData(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectReservedProfileData(child, `${path}[${String(index)}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (RESERVED_PROFILE_KEYS.has(key.toLowerCase())) {
      throw inputError(`${path}.${key} contains target, authority, or credential data`);
    }
    rejectReservedProfileData(child, `${path}.${key}`);
  }
}

export function emptyCampusWeaveProfile(id: string, name: string): CampusWeaveProfile {
  return {
    schema_version: 2,
    id,
    name,
    organizations: [],
    locations: [],
    cohorts: [],
    intents: [],
    scope_blueprints: [],
    assignments: [],
    rollout_stages: [],
    unresolved: [],
  };
}

export function campusWeaveProfileDigest(profile: CampusWeaveProfile): string {
  return canonicalJsonSha256(profile);
}

function parseMapping(value: unknown, index: number): CampusWeaveMapping {
  const label = `project.mappings[${String(index)}]`;
  const mapping = record(value, label);
  if (typeof mapping.reviewed !== "boolean") throw inputError(`${label}.reviewed must be a boolean`);
  if (!Object.hasOwn(mapping, "value")) throw inputError(`${label}.value is required`);
  return {
    ...mapping,
    ...(mapping.id === undefined ? {} : { id: identifier(mapping.id, `${label}.id`) }),
    intent_id: nonEmptyString(mapping.intent_id, `${label}.intent_id`, 256),
    workspace_id: identifier(mapping.workspace_id, `${label}.workspace_id`),
    policy_id: nonEmptyString(mapping.policy_id, `${label}.policy_id`, 256),
    configuration_id: nonEmptyString(mapping.configuration_id, `${label}.configuration_id`, 256),
    field: nonEmptyString(mapping.field, `${label}.field`, 512),
    value: mapping.value,
    platform: nonEmptyString(mapping.platform, `${label}.platform`, 64),
    configuration_type: nonEmptyString(mapping.configuration_type, `${label}.configuration_type`, 256),
    applicability: nonEmptyString(mapping.applicability, `${label}.applicability`, 256),
    reviewed: mapping.reviewed,
    profile_digest: digest(mapping.profile_digest, `${label}.profile_digest`),
    policy_revision: nonEmptyString(mapping.policy_revision, `${label}.policy_revision`, 256),
  };
}

function parseEvidence(value: unknown, index: number): CampusWeaveEvidence {
  const label = `project.evidence[${String(index)}]`;
  const evidence = record(value, label);
  const kind = nonEmptyString(evidence.kind, `${label}.kind`, 32);
  if (kind !== "local" && kind !== "target" && kind !== "device" && kind !== "recovery") {
    throw inputError(`${label}.kind is unsupported`);
  }
  return {
    ...evidence,
    intent_id: nonEmptyString(evidence.intent_id, `${label}.intent_id`, 256),
    workspace_id: identifier(evidence.workspace_id, `${label}.workspace_id`),
    requirement_id: nonEmptyString(evidence.requirement_id, `${label}.requirement_id`, 256),
    kind,
    profile_digest: digest(evidence.profile_digest, `${label}.profile_digest`),
    policy_revision: nonEmptyString(evidence.policy_revision, `${label}.policy_revision`, 256),
    artifact_digest: digest(evidence.artifact_digest, `${label}.artifact_digest`),
    catalog_digest: digest(evidence.catalog_digest, `${label}.catalog_digest`),
    ...(evidence.assurance_digest === undefined ? {} : {
      assurance_digest: digest(evidence.assurance_digest, `${label}.assurance_digest`),
    }),
  };
}

function parseWorkspaceRef(value: unknown, index: number): CampusWeaveWorkspaceRef {
  const label = `project.workspace_refs[${String(index)}]`;
  const workspace = record(value, label);
  return {
    ...workspace,
    id: identifier(workspace.id, `${label}.id`),
    name: nonEmptyString(workspace.name, `${label}.name`, 160),
    platform: nonEmptyString(workspace.platform, `${label}.platform`, 64),
    created_at: nonEmptyString(workspace.created_at, `${label}.created_at`, 64),
  };
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw inputError(`${label} must be an object`);
  return value as JsonRecord;
}

function nullableRecord(value: unknown, label: string): JsonRecord | null {
  return value === null ? null : record(value, label);
}

function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw inputError(`${label} must be an array`);
  if (value.length > max) throw inputError(`${label} exceeds its ${String(max)} item limit`);
  return value;
}

function nonEmptyString(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0) throw inputError(`${label} must be a non-empty string`);
  if (value.length > max) throw inputError(`${label} exceeds its ${String(max)} character limit`);
  return value;
}

function identifier(value: unknown, label: string): string {
  const parsed = nonEmptyString(value, label, 64);
  if (!CAMPUSWEAVE_ID_PATTERN.test(parsed)) throw inputError(`${label} must be a lowercase identifier`);
  return parsed;
}

function revision(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw inputError(`${label} must be a positive integer`);
  return value as number;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw inputError(`${label} must be a SHA-256 digest`);
  return value;
}

function assertUniqueIds(values: readonly { readonly id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) throw inputError(`Duplicate ${label} id: ${value.id}`);
    seen.add(value.id);
  }
}

function inputError(message: string): CampusWeaveInputError {
  return new CampusWeaveInputError(message);
}

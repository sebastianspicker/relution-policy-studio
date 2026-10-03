/** Contracts for the unified CampusWeave project host. */
import type { JsonRecord } from "../platform/serialization/json-guards.js";

export interface CampusWeaveProfile extends JsonRecord {
  schema_version: 2;
  id: string;
  name: string;
  organizations: unknown[];
  locations: unknown[];
  cohorts: unknown[];
  intents: unknown[];
  scope_blueprints: unknown[];
  assignments: unknown[];
  rollout_stages: unknown[];
  unresolved: unknown[];
}

export interface CampusWeaveMapping extends JsonRecord {
  id?: string;
  intent_id: string;
  workspace_id: string;
  policy_id: string;
  configuration_id: string;
  field: string;
  value: unknown;
  platform: string;
  configuration_type: string;
  applicability: string;
  reviewed: boolean;
  profile_digest: string;
  policy_revision: string;
}

export interface CampusWeaveEvidence extends JsonRecord {
  intent_id: string;
  workspace_id: string;
  requirement_id: string;
  kind: "local" | "target" | "device" | "recovery";
  profile_digest: string;
  policy_revision: string;
  artifact_digest: string;
  catalog_digest: string;
  /** Absent on legacy evidence; absence never establishes assurance currency. */
  assurance_digest?: string;
}

export interface CampusWeaveWorkspaceRef extends JsonRecord {
  id: string;
  name: string;
  platform: string;
  created_at: string;
}

export interface CampusWeaveProject extends JsonRecord {
  schema_version: 1;
  id: string;
  name: string;
  revision: number;
  profile: CampusWeaveProfile;
  compiled_plan: JsonRecord | null;
  mappings: CampusWeaveMapping[];
  workspace_refs: CampusWeaveWorkspaceRef[];
  evidence: CampusWeaveEvidence[];
  operations: JsonRecord[];
  /** Reviewed selections, decisions, exclusions and external evidence obligations. */
  assurance_reviews?: JsonRecord[];
}

export type CampusWeavePlannerCommand = "reference" | "convert-v1" | "validate" | "compile";

export interface CampusWeaveReviewMapping extends JsonRecord {
  mapping_index: number;
  intent_id: string;
  current: boolean;
  reviewed: boolean;
  projectable: boolean;
  reasons: string[];
}

export interface CampusWeaveReview extends JsonRecord {
  project_id: string;
  revision: number;
  profile_digest: string;
  complete: boolean;
  mappings: CampusWeaveReviewMapping[];
  unresolved: unknown[];
  conflicts: JsonRecord[];
  evidence: JsonRecord[];
  project: CampusWeaveProject;
  artifact_manifest: JsonRecord[];
  trusted_compilation: JsonRecord | null;
  assurance_digest: string | null;
  assurance_reviews: JsonRecord[];
  execution_authorized: false;
  deployment_authorized: false;
  verification_scope: string;
}

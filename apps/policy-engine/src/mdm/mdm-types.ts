/** Declares contracts for generated MDM import artifacts and validation. */
type MdmPlatform = "IOS" | "MACOS" | "WINDOWS" | "ANDROID_ENTERPRISE" | "TVOS" | "VISIONOS";
type MdmPolicyStatus = "active" | "migration-only" | "capability-only";
type MdmRing = "LAB" | "PILOT" | "EARLY" | "BROAD";

export interface MdmControl {
  schema_version: 1;
  control_id: string;
  title: string;
  classification: "mandatory" | "recommended" | "optional" | "use-case-specific" | "not-recommended" | "unsupported" | "not-applicable";
  source_mappings: Array<{ source_id: string; control_reference: string; page?: number | null; verification_status: "verified" | "unverifiable" | "stale" | "intune-specific" | "unsupported" }>;
  applicability: Record<string, unknown>;
  platform_prerequisites: string[];
  proposed_value: unknown;
  variants: Array<Record<string, unknown>>;
  impacts: Record<string, unknown>;
  residual_risk: string;
  relution_target: Record<string, unknown>;
  verification: Record<string, unknown>;
  exception: Record<string, unknown>;
  review_cadence: string;
}

interface MdmPolicySetting {
  configuration_type: string;
  values: Record<string, unknown>;
  control_ids: string[];
  variants?: string[];
}

export interface MdmPolicySource {
  schema_version: number;
  policy_id: string;
  platform: MdmPlatform;
  model: string;
  ownership: string;
  enrollment_model: string;
  layer: number;
  purpose: string;
  status: MdmPolicyStatus;
  evidence_status: "APPROVED" | "REFERENCE_VALIDATED" | "NOT_EVIDENCED";
  minimum_os: string;
  controls: string[];
  dependencies: string[];
  environment_placeholders: string[];
  settings: MdmPolicySetting[];
  rings: MdmRing[];
  production_ready: boolean;
}

export interface MdmSourceManifestEntry {
  id: string;
  title: string;
  publisher: string;
  version: string;
  date: string;
  sha256: string | null;
  local_path: string;
  licence: string;
  scope: string;
  extraction: {
    status: "extracted" | "missing_local" | "failed";
    pages: number | null;
    text_sha256: string | null;
    engine: string;
  };
}

export interface MdmValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface MdmValidationReport {
  ok: boolean;
  relution_version: string;
  source_count: number;
  policy_count: number;
  active_policy_count: number;
  issues: MdmValidationIssue[];
}

export interface MdmGeneratedFile {
  path: string;
  sha256: string;
  kind: "ruleset" | "workspace";
}

export interface MdmGeneratedManifest {
  schema_version: number;
  relution_version: "26.1.1";
  generated_ring: "LAB";
  status: "REFERENCE_VALIDATED";
  production_ready: false;
  source_hashes: Record<string, string>;
  output_hashes: MdmGeneratedFile[];
  artifacts: Array<{
    policy_id: string;
    source_path: string;
    ruleset_path: string;
    workspace_path: string;
    prerequisites: string[];
    required_manual_values: string[];
    expected_create_update_behavior: "create-or-explicit-update-after-human-diff";
    rollback_reference: string;
    syntax_validated: boolean;
    schema_validated: boolean;
    roundtrip_imported_in_lab: boolean;
    applied_to_test_device: boolean;
    rollback_tested: boolean;
    production_approved: false;
  }>;
  import_behavior: "create-or-explicit-update-after-human-diff";
  required_manual_values: string[];
  archive_generation: {
    runtime_key_env: "RELUTION_REXP_KEY";
    output_lane: "private/mdm-archives/LAB";
    deterministic_manifest_excludes_encrypted_archive_hashes: true;
  };
  validation: {
    syntax_validated: boolean;
    schema_validated: boolean;
    roundtrip_imported_in_lab: boolean;
    applied_to_test_device: boolean;
    rollback_tested: boolean;
    production_approved: boolean;
  };
}

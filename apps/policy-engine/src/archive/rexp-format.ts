/** Shared REXP format limits and public result contracts. */
export type ArchiveHashStatus = "match" | "mismatch" | "absent";

export interface PolicySummary {
  path: string;
  uuid?: string;
  name?: string;
  platform?: string;
  versionCount?: number;
  configurationCount?: number;
  plaintextBytes?: number;
  sha256?: string;
  expectedSha256?: string;
  hashStatus: ArchiveHashStatus;
}

export interface InspectResult {
  file: string;
  metadata: unknown;
  report: unknown;
  policyEntries: string[];
  hashes?: Record<string, string>;
  policies?: PolicySummary[];
}

export interface VerificationResult {
  ok: boolean;
  checkedEntries: PolicySummary[];
}

export interface ExtractOptions {
  force?: boolean;
  pretty?: boolean;
}

export interface PackOptions {
  force?: boolean;
  randomBytes?: (size: number) => Buffer;
}

export const METADATA_JSON = "metadata.json";
export const REPORT_JSON = "report.json";
export const METADATA_BIN = "metadata.bin";
export const HASHES_JSON = "metadata.hashes.json";
export const MAX_REXP_ENTRIES = 1024;
export const MAX_REXP_POLICY_ENTRIES = MAX_REXP_ENTRIES - 3;
export const MAX_REXP_TOTAL_COMPRESSED_BYTES = 64 * 1024 * 1024;
export const MAX_REXP_TOTAL_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
export const MANAGED_PROJECT_PATHS = [METADATA_JSON, REPORT_JSON, HASHES_JSON, "policies"] as const;

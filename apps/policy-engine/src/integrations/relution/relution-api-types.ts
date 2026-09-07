/** Protocol-specific Relution connection contracts. Shared assessment DTOs live in contracts/. */

export type {
  RelutionAssessmentIssue,
  RelutionAssessmentReport,
  RelutionDeviceAssessment,
  RelutionDeviceQueryInput,
  RelutionDeviceQueryOptions,
  RelutionDeviceQueryResult,
  RelutionDeviceSortField,
  RelutionDeviceSummary,
} from "../../contracts/relution-assessment.js";

export type RelutionProtocol = "http" | "https";

export interface RelutionConnectionInput {
  protocol?: RelutionProtocol;
  host: string;
  port?: number;
  basePath?: string;
  apiToken: string;
  allowLocalServiceHosts?: boolean;
}

export interface RelutionConnection {
  protocol: RelutionProtocol;
  host: string;
  port?: number;
  basePath: string;
  apiToken: string;
  baseUrl: string;
  allowLocalServiceHosts: boolean;
  mode: "read-only";
}

export interface RelutionPublicSession {
  configured: boolean;
  baseUrl?: string;
  tokenConfigured: boolean;
  mode: "read-only";
}

export type RelutionConnectionTestResult =
  | { ok: true; baseUrl: string }
  | { ok: false; baseUrl: string; reason: string };

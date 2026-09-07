/** Defines protocol, filter, and request-domain contracts for external dashboard integrations. */
import type {
  RelutionAssessmentReport,
  RelutionDeviceQueryResult,
} from "../../../../src/browser/integrations.js";

export type Protocol = "http" | "https";
export type DeviceFilter = "all" | "noncompliant" | "missing-policy" | "inactive";
export type RequestDomain = "relution-session" | "relution-audit" | "relution-report" | "zammad-session" | "zammad-ticket";

export interface ConnectionTestResponse {
  readonly ok?: boolean;
  readonly baseUrl?: string;
  readonly reason?: string;
  readonly error?: string;
}

export interface AuditResponse {
  readonly query: RelutionDeviceQueryResult;
  readonly report: RelutionAssessmentReport;
  readonly assessmentId: string;
}

export interface ReportWriteResult {
  readonly jsonPath: string;
  readonly markdownPath: string;
}

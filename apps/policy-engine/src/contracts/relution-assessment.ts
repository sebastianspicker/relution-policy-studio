/** Neutral DTOs shared by Relution adapters, application use cases, and browser projections. */

export interface RelutionDeviceQueryInput {
  limit?: number;
  offset?: number;
  platforms?: string[];
  statuses?: string[];
  ownerships?: string[];
  search?: string;
  sortField?: RelutionDeviceSortField;
  sortAscending?: boolean;
}

export type RelutionDeviceQueryOptions = {
  [Key in keyof RelutionDeviceQueryInput]?: RelutionDeviceQueryInput[Key] | undefined;
};

export type RelutionDeviceSortField = "lastConnectionDate" | "name" | "platform" | "status" | "policyStatus";

export interface RelutionDeviceQueryResult {
  baseUrl: string;
  count: number;
  total?: number;
  truncated: boolean;
  devices: RelutionDeviceSummary[];
}

export interface RelutionDeviceSummary {
  uuid?: string;
  name: string;
  platform?: string;
  status?: string;
  policyStatus?: string;
  lastConnectionDate?: string;
  inactiveDays?: number;
  ownership?: string;
  serialNumber?: string;
  userName?: string;
  userEmail?: string;
  assignedPolicies?: string[];
  raw: Record<string, unknown>;
}

type RelutionAssessmentIssueId =
  | "device-identity-missing"
  | "device-status-missing"
  | "device-status-noncompliant"
  | "policy-status-missing"
  | "policy-status-not-applied"
  | "missing-policy"
  | "policy-assignment-unknown"
  | "inactive-warning"
  | "inactive-problem";

export interface RelutionAssessmentIssue {
  id: RelutionAssessmentIssueId;
  severity: "warning" | "problem" | "unknown";
  message: string;
  evidence: Record<string, string>;
}

export interface RelutionDeviceAssessment {
  device: RelutionDeviceSummary;
  status: "compliant" | "issue" | "not-checkable";
  issues: RelutionAssessmentIssue[];
}

export interface RelutionAssessmentCompleteness {
  assessedCount: number;
  total?: number;
  truncated: boolean;
  status: "complete" | "partial" | "unknown";
}

export interface RelutionAssessmentReport {
  generatedAt: string;
  baseUrl: string;
  completeness: RelutionAssessmentCompleteness;
  summary: {
    totalDevices: number;
    compliant: number;
    issue: number;
    notCheckable: number;
    missingPolicy: number;
    inactiveWarning: number;
    inactiveProblem: number;
    byPlatform: Record<string, number>;
    byStatus: Record<string, number>;
    byPolicyStatus: Record<string, number>;
  };
  devices: RelutionDeviceAssessment[];
}

export interface RelutionAssessmentOptions {
  expectedPoliciesByPlatform?: Record<string, string[]>;
  inactiveWarningDays?: number;
  inactiveProblemDays?: number;
  now?: Date;
}

export interface RelutionReportPaths {
  jsonPath: string;
  markdownPath: string;
}

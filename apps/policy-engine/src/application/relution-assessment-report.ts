// Builds device assessment reports and validates assessment coverage and thresholds.
import type {
  RelutionAssessmentCompleteness,
  RelutionAssessmentIssue,
  RelutionAssessmentOptions,
  RelutionAssessmentReport,
  RelutionDeviceAssessment,
  RelutionDeviceQueryResult,
  RelutionDeviceSummary,
} from "../contracts/relution-assessment.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function assessRelutionDevices(
  baseUrl: string,
  devices: RelutionDeviceSummary[],
  completeness: RelutionAssessmentCompleteness = assessmentCompleteness({ count: devices.length, truncated: false }),
): RelutionAssessmentReport {
  return createRelutionAssessmentReport(baseUrl, devices, {}, completeness);
}

export function createRelutionAssessmentReport(
  baseUrl: string,
  devices: RelutionDeviceSummary[],
  options: RelutionAssessmentOptions = {},
  completeness: RelutionAssessmentCompleteness = assessmentCompleteness({ count: devices.length, truncated: false }),
): RelutionAssessmentReport {
  const normalizedOptions = normalizeAssessmentOptions(options);
  const assessments = devices.map((device) => assessDevice(device, normalizedOptions));
  const summary = {
    totalDevices: assessments.length,
    compliant: assessments.filter((entry) => entry.status === "compliant").length,
    issue: assessments.filter((entry) => entry.status === "issue").length,
    notCheckable: assessments.filter((entry) => entry.status === "not-checkable").length,
    missingPolicy: assessments.filter((entry) => entry.issues.some((issue) => issue.id === "missing-policy")).length,
    inactiveWarning: assessments.filter((entry) => entry.issues.some((issue) => issue.id === "inactive-warning" || issue.id === "inactive-problem")).length,
    inactiveProblem: assessments.filter((entry) => entry.issues.some((issue) => issue.id === "inactive-problem")).length,
    byPlatform: countBy(devices.map((device) => device.platform ?? "UNKNOWN")),
    byStatus: countBy(devices.map((device) => device.status ?? "UNKNOWN")),
    byPolicyStatus: countBy(devices.map((device) => device.policyStatus ?? "UNKNOWN")),
  };
  return { generatedAt: new Date().toISOString(), baseUrl, completeness, summary, devices: assessments };
}

export function assessmentCompleteness(query: Pick<RelutionDeviceQueryResult, "count" | "total" | "truncated">): RelutionAssessmentCompleteness {
  return {
    assessedCount: query.count,
    ...(query.total === undefined ? {} : { total: query.total }),
    truncated: query.truncated,
    status: query.total === undefined ? "unknown" : query.truncated ? "partial" : "complete",
  };
}

export function validateRelutionAssessmentOptions(options: RelutionAssessmentOptions): void {
  normalizeAssessmentOptions(options);
}

function assessDevice(device: RelutionDeviceSummary, options: Required<RelutionAssessmentOptions>): RelutionDeviceAssessment {
  const issues: RelutionAssessmentIssue[] = [];
  const inactiveDays = inactiveDaysSince(device.lastConnectionDate, options.now);
  const assessedDevice = inactiveDays === undefined ? device : { ...device, inactiveDays };
  addDeviceClassificationIssues(issues, device);
  addMissingPolicyIssues(issues, device, options.expectedPoliciesByPlatform);
  addInactiveIssues(issues, inactiveDays, options);
  return {
    device: assessedDevice,
    status: issues.length === 0
      ? "compliant"
      : issues.some((issue) => issue.severity === "problem" || issue.severity === "warning") ? "issue" : "not-checkable",
    issues,
  };
}

function addDeviceClassificationIssues(issues: RelutionAssessmentIssue[], device: RelutionDeviceSummary): void {
  addDeviceIdentityIssues(issues, device);
  addDeviceStatusIssues(issues, device);
  addPolicyStatusIssues(issues, device);
}

function addDeviceIdentityIssues(issues: RelutionAssessmentIssue[], device: RelutionDeviceSummary): void {
  if (device.uuid === undefined || device.uuid.trim().length === 0) {
    issues.push({
      id: "device-identity-missing",
      severity: "unknown",
      message: "Device has no stable uuid or id and cannot be reliably assessed.",
      evidence: {},
    });
  }
}

function addDeviceStatusIssues(issues: RelutionAssessmentIssue[], device: RelutionDeviceSummary): void {
  if (device.status === undefined) {
    issues.push({
      id: "device-status-missing",
      severity: "unknown",
      message: "Device compliance status is not exposed by the query response.",
      evidence: {},
    });
  } else if (device.status !== "COMPLIANT") {
    issues.push({
      id: "device-status-noncompliant",
      severity: "problem",
      message: `Device status is ${device.status}.`,
      evidence: { status: device.status },
    });
  }
}

function addPolicyStatusIssues(issues: RelutionAssessmentIssue[], device: RelutionDeviceSummary): void {
  if (device.policyStatus === undefined) {
    issues.push({
      id: "policy-status-missing",
      severity: "unknown",
      message: "Device policy status is not exposed by the query response.",
      evidence: {},
    });
  } else if (!["APPLIED", "UPDATE"].includes(device.policyStatus)) {
    issues.push({
      id: "policy-status-not-applied",
      severity: device.policyStatus === "NONE" || device.policyStatus === "UNKNOWN" ? "problem" : "warning",
      message: `Policy status is ${device.policyStatus}.`,
      evidence: { policyStatus: device.policyStatus },
    });
  }
}

function addMissingPolicyIssues(
  issues: RelutionAssessmentIssue[],
  device: RelutionDeviceSummary,
  expectedPoliciesByPlatform: Record<string, string[]>,
): void {
  const expected = device.platform !== undefined && Object.hasOwn(expectedPoliciesByPlatform, device.platform)
    ? expectedPoliciesByPlatform[device.platform]
    : undefined;
  if (expected === undefined || expected.length === 0) {
    return;
  }
  if (device.assignedPolicies === undefined) {
    issues.push({
      id: "policy-assignment-unknown",
      severity: "unknown",
      message: `Expected policies for ${device.platform} cannot be checked because assigned policies are not exposed by the query response.`,
      evidence: { expectedPolicies: expected.join(", ") },
    });
    return;
  }
  const assigned = new Set(device.assignedPolicies.map((policy) => policy.toLowerCase()));
  const missing = expected.filter((policy) => !assigned.has(policy.toLowerCase()));
  if (missing.length > 0) {
    issues.push({
      id: "missing-policy",
      severity: "problem",
      message: `Missing expected policies: ${missing.join(", ")}.`,
      evidence: { expectedPolicies: expected.join(", "), assignedPolicies: device.assignedPolicies.join(", "), missingPolicies: missing.join(", ") },
    });
  }
}

function addInactiveIssues(
  issues: RelutionAssessmentIssue[],
  inactiveDays: number | undefined,
  options: Required<RelutionAssessmentOptions>,
): void {
  if (inactiveDays === undefined || inactiveDays < options.inactiveWarningDays) {
    return;
  }
  if (inactiveDays >= options.inactiveProblemDays) {
    issues.push(inactiveIssue("inactive-problem", "problem", inactiveDays, options.inactiveProblemDays));
    return;
  }
  issues.push(inactiveIssue("inactive-warning", "warning", inactiveDays, options.inactiveWarningDays));
}

function inactiveIssue(
  id: "inactive-problem" | "inactive-warning",
  severity: "problem" | "warning",
  inactiveDays: number,
  thresholdDays: number,
): RelutionAssessmentIssue {
  return {
    id,
    severity,
    message: `Device has not checked in for ${String(inactiveDays)} days.`,
    evidence: { inactiveDays: String(inactiveDays), thresholdDays: String(thresholdDays) },
  };
}

function normalizeAssessmentOptions(options: RelutionAssessmentOptions): Required<RelutionAssessmentOptions> {
  const inactiveWarningDays = options.inactiveWarningDays ?? 30;
  const inactiveProblemDays = options.inactiveProblemDays ?? 90;
  if (!Number.isSafeInteger(inactiveWarningDays) || inactiveWarningDays < 0) {
    throw new Error("Inactive warning days must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(inactiveProblemDays) || inactiveProblemDays < 0) {
    throw new Error("Inactive problem days must be a non-negative safe integer");
  }
  if (inactiveProblemDays < inactiveWarningDays) {
    throw new Error("Inactive problem days must be greater than or equal to inactive warning days");
  }
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Relution assessment time must be a valid date");
  }
  return {
    expectedPoliciesByPlatform: normalizeExpectedPolicies(options.expectedPoliciesByPlatform),
    inactiveWarningDays,
    inactiveProblemDays,
    now,
  };
}

function normalizeExpectedPolicies(value: unknown): Record<string, string[]> {
  const normalized = Object.create(null) as Record<string, string[]>;
  if (value === undefined) {
    return normalized;
  }
  const record = asRecord(value);
  if (record === undefined) {
    throw new Error("Expected policies by platform must be an object");
  }
  for (const [platform, policies] of Object.entries(record)) {
    if (!Array.isArray(policies) || !policies.every((policy) => typeof policy === "string")) {
      throw new Error(`Expected policies for platform ${platform} must be a string array`);
    }
    normalized[platform] = [...policies];
  }
  return normalized;
}

function inactiveDaysSince(value: string | undefined, now: Date): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

function countBy(values: string[]): Record<string, number> {
  const counts = Object.create(null) as Record<string, number>;
  for (const value of values) {
    const previous = Object.hasOwn(counts, value) ? counts[value] : undefined;
    counts[value] = (previous ?? 0) + 1;
  }
  return counts;
}

import type { RelutionAssessmentIssue, RelutionDeviceAssessment } from "./relution-api.js";

export type ZammadTicketKind = "non-compliant-device" | "inactive-device";

export interface ZammadTicketDraft {
  kind: ZammadTicketKind;
  title: string;
  body: string;
  deviceUuid?: string;
  issueId: string;
}

export function buildZammadTicketDraft(assessment: RelutionDeviceAssessment, issue: RelutionAssessmentIssue): ZammadTicketDraft {
  return issue.id === "inactive-warning" || issue.id === "inactive-problem"
    ? buildInactiveDeviceTicketDraft(assessment, issue)
    : buildNonCompliantDeviceTicketDraft(assessment, issue);
}

export function buildNonCompliantDeviceTicketDraft(
  assessment: RelutionDeviceAssessment,
  issue: RelutionAssessmentIssue,
): ZammadTicketDraft {
  const device = assessment.device;
  const body = [
    "Relution device compliance finding",
    "",
    ...deviceLines(assessment),
    "",
    "Finding",
    `- Issue: ${issue.id}`,
    `- Severity: ${issue.severity}`,
    `- Message: ${issue.message}`,
    ...evidenceLines(issue),
    "",
    "Recommended remediation",
    "- Check device enrollment and reachability in Relution.",
    "- Verify that the expected policy is assigned to the device.",
    "- Re-push the policy from Relution and check the policy status afterwards.",
    "- Contact the assigned user if the device is offline.",
    "- Document an exception if the policy is intentionally not assigned.",
  ];
  return {
    kind: "non-compliant-device",
    title: `MDM non-compliance: ${device.name}`,
    body: body.join("\n"),
    ...(device.uuid === undefined ? {} : { deviceUuid: device.uuid }),
    issueId: issue.id,
  };
}

export function buildInactiveDeviceTicketDraft(
  assessment: RelutionDeviceAssessment,
  issue: RelutionAssessmentIssue,
): ZammadTicketDraft {
  const device = assessment.device;
  const inactiveDays = device.inactiveDays ?? Number(issue.evidence.inactiveDays);
  const body = [
    "Relution inactive device finding",
    "",
    ...deviceLines(assessment),
    "",
    "Finding",
    `- Issue: ${issue.id}`,
    `- Severity: ${issue.severity}`,
    `- Message: ${issue.message}`,
    ...evidenceLines(issue),
    "",
    "Recommended follow-up",
    ...inactiveRemediationSteps(Number.isFinite(inactiveDays) ? inactiveDays : undefined),
  ];
  return {
    kind: "inactive-device",
    title: `MDM inactive device: ${device.name} (${Number.isFinite(inactiveDays) ? `${String(inactiveDays)}d` : "unknown"})`,
    body: body.join("\n"),
    ...(device.uuid === undefined ? {} : { deviceUuid: device.uuid }),
    issueId: issue.id,
  };
}

function deviceLines(assessment: RelutionDeviceAssessment): string[] {
  const device = assessment.device;
  return [
    "Device",
    `- Name: ${device.name}`,
    `- UUID: ${device.uuid ?? "unknown"}`,
    `- Platform: ${device.platform ?? "unknown"}`,
    `- User: ${device.userName ?? "unknown"}`,
    `- Email: ${device.userEmail ?? "unknown"}`,
    `- Serial: ${device.serialNumber ?? "unknown"}`,
    `- Ownership: ${device.ownership ?? "unknown"}`,
    `- Device status: ${device.status ?? "unknown"}`,
    `- Policy status: ${device.policyStatus ?? "unknown"}`,
    `- Last connection: ${device.lastConnectionDate ?? "unknown"}`,
    `- Assigned policies: ${device.assignedPolicies?.join(", ") ?? "unknown"}`,
    `- Assessment status: ${assessment.status}`,
  ];
}

function evidenceLines(issue: RelutionAssessmentIssue): string[] {
  const entries = Object.entries(issue.evidence);
  if (entries.length === 0) {
    return ["- Evidence: none exposed"];
  }
  return ["- Evidence:", ...entries.map(([key, value]) => `  - ${key}: ${value}`)];
}

function inactiveRemediationSteps(inactiveDays: number | undefined): string[] {
  if (inactiveDays === undefined) {
    return [
      "- Verify the last check-in timestamp in Relution.",
      "- Contact the assigned user if the device should still be managed.",
    ];
  }
  if (inactiveDays >= 90) {
    return [
      "- Treat this as a stale asset candidate.",
      "- Verify ownership and inventory status.",
      "- Decide whether the device should be unenrolled, retired, or recovered.",
    ];
  }
  if (inactiveDays >= 60) {
    return [
      "- Escalate to IT follow-up.",
      "- Check ownership and user assignment.",
      "- Verify whether the device is still in active use.",
    ];
  }
  return [
    "- Contact the assigned user.",
    "- Ask the user to connect the device to the network.",
    "- Verify that Relution receives a fresh check-in.",
  ];
}

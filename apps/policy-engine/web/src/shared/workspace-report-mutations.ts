/** Keeps the browser export report aligned with policy mutations. */
import { asRecord } from "./editor-record-utils.js";
import type { JsonRecord } from "./editor-contracts.js";
export { recordPolicyInReport } from "./workspace-report-record.js";
export function updateReportPolicyName(policy: JsonRecord, report: JsonRecord, name: string): void { const uuid = typeof policy.uuid === "string" ? policy.uuid : undefined; const exported = asRecord(report.exportedPolicies); const entry = uuid === undefined || exported === undefined || !Object.hasOwn(exported, uuid) ? undefined : asRecord(exported[uuid]); if (entry !== undefined) entry.policyName = name; }
export function removePolicyFromReport(report: JsonRecord, policy: JsonRecord): void { const uuid = typeof policy.uuid === "string" ? policy.uuid : undefined; if (uuid === undefined) return; if (Array.isArray(report.policiesToExport)) report.policiesToExport = report.policiesToExport.filter((entry) => entry !== uuid); const exported = asRecord(report.exportedPolicies); if (exported !== undefined && Object.hasOwn(exported, uuid)) delete exported[uuid]; }

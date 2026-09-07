/** Sends the debounced compliance refresh request and validates its response. */
import type { ComplianceReport } from "../../../../src/browser/assurance.js";
import type { RecommendationSource } from "../../../../src/browser/assurance.js";
import { postJson } from "../../shared/editor-api-client.js";
import { readJsonResponse } from "../../shared/editor-record-utils.js";
import type { JsonRecord, Selection } from "../../shared/editor-contracts.js";

export async function requestComplianceReport(
  workspace: { readonly policies: readonly { readonly path: string }[] },
  selection: Selection,
  sources: RecommendationSource[],
  expectedRevision: string,
): Promise<ComplianceReport> {
  const policyPath = workspace.policies[selection.policyIndex]?.path;
  if (policyPath === undefined) throw new Error("Selected policy is no longer available");
  const response = await postJson("/api/compliance/check", {
    expectedRevision,
    target: { policyPath, versionIndex: selection.versionIndex },
    sources,
  });
  const result = await readJsonResponse<{ report?: ComplianceReport } & JsonRecord>(response);
  if (!response.ok || result.report === undefined) throw new Error(JSON.stringify(result));
  return result.report;
}

/** Builds compliance reports for one selected policy version. */
import { sourceStatus } from "./compliance-artifacts.js";
import {
  appliesToPolicy,
  evaluateRecommendation,
  selectedPolicyTarget,
} from "./compliance-internals.js";
import type {
  BuildComplianceReportInput,
  ComplianceRecommendationResult,
  ComplianceReport,
} from "./compliance-types.js";

export function buildComplianceReport(input: BuildComplianceReportInput): ComplianceReport {
  // Compliance is evaluated against the selected local policy version only.
  // The recommendation corpus can contain display platforms that map to a
  // different Relution import platform, so applicability is checked per source.
  const selectedSources = input.sources;
  const sourceStatuses = selectedSources.map((source) => sourceStatus(source, input.catalogs[source]));
  const warnings = sourceStatuses.flatMap((status) => status.warnings);
  const target = selectedPolicyTarget(input.workspace, input.selection);
  const results: ComplianceRecommendationResult[] = [];
  for (const source of selectedSources) {
    const artifacts = input.catalogs[source];
    if (artifacts === undefined || !artifacts.recommendationCatalog.available) {
      continue;
    }
    for (const recommendation of artifacts.recommendationCatalog.recommendations) {
      if (!appliesToPolicy(artifacts.recommendationCatalog, recommendation.platform, target.policyPlatform)) {
        continue;
      }
      results.push(evaluateRecommendation(source, recommendation, target.configurations, artifacts, input.appleSchema));
    }
  }

  const summary: ComplianceReport["summary"] = {
    totalRecommendations: results.length,
    byStatus: {
      compliant: 0,
      "exact-gap": 0,
      "choice-required": 0,
      "parameter-required": 0,
      "not-checkable": 0,
    },
  };
  for (const result of results) {
    summary.byStatus[result.status] += 1;
  }

  return {
    policyPath: target.policy.path,
    policyName: target.policyName,
    policyPlatform: target.policyPlatform,
    versionIndex: input.selection.versionIndex,
    sources: selectedSources,
    sourceStatuses,
    warnings,
    results,
    summary,
  };
}

import { type AppleSchemaCatalog } from "./apple-schema.js";
import { type RecommendationSource } from "./recommendation-types.js";
import { type PolicyWorkspace } from "./workspace.js";
import { type RelutionTemplateBundle } from "./templates.js";
import {
  applyNativeBundle,
  applyRecommendationMappings,
  appliesToPolicy,
  evaluateRecommendation,
  selectedPolicyTarget,
} from "./compliance-internals.js";
import { findSettingBundle } from "./compliance-values.js";
import type {
  ApplyComplianceRemediationInput,
  ApplyComplianceRemediationResult,
  BuildComplianceReportInput,
  ComplianceRecommendationResult,
  ComplianceReport,
  ComplianceSourceArtifacts,
} from "./compliance-types.js";

export type {
  ApplyComplianceRemediationInput,
  ApplyComplianceRemediationResult,
  BuildComplianceReportInput,
  ComplianceConfigurationReference,
  ComplianceMappingResult,
  ComplianceMappingStatus,
  ComplianceRecommendationResult,
  ComplianceRemediationOption,
  ComplianceReport,
  ComplianceSelection,
  ComplianceSourceArtifacts,
  ComplianceStatus,
} from "./compliance-types.js";

export function buildComplianceReport(input: BuildComplianceReportInput): ComplianceReport {
  const selectedSources = input.sources.filter((source) => input.catalogs[source] !== undefined);
  const target = selectedPolicyTarget(input.workspace, input.selection);
  const results: ComplianceRecommendationResult[] = [];
  for (const source of selectedSources) {
    const artifacts = input.catalogs[source];
    if (artifacts === undefined) {
      continue;
    }
    for (const recommendation of artifacts.recommendationCatalog.recommendations) {
      if (!appliesToPolicy(source, artifacts.recommendationCatalog, recommendation.platform, target.policyPlatform)) {
        continue;
      }
      results.push(evaluateRecommendation(source, recommendation, target.configurations, artifacts, input.bundle, input.appleSchema));
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
    results,
    summary,
  };
}

export function applyComplianceRemediationToWorkspace(input: ApplyComplianceRemediationInput): ApplyComplianceRemediationResult {
  const report = buildComplianceReport(input);
  const result = report.results.find((candidate) => candidate.source === input.source && candidate.recommendationId === input.recommendationId);
  if (result === undefined) {
    throw new Error(`Compliance recommendation not found: ${input.source}:${input.recommendationId}`);
  }
  const remediation = result.remediationOptions.find((candidate) => candidate.id === input.remediationId);
  if (remediation === undefined) {
    throw new Error(`Compliance remediation not available: ${input.remediationId}`);
  }

  const nextWorkspace = structuredClone(input.workspace) as PolicyWorkspace;
  const target = selectedPolicyTarget(nextWorkspace, input.selection);

  if (remediation.kind === "native-bundle") {
    const bundle = findSettingBundle(input.catalogs[input.source]?.settingBundleCatalog, remediation.bundleId);
    if (bundle === undefined) {
      throw new Error(`Compliance bundle not found: ${String(remediation.bundleId)}`);
    }
    applyNativeBundle(target.configurations, bundle, input.bundle);
  } else {
    applyRecommendationMappings(target.configurations, result.recommendation, input.bundle, input.appleSchema);
  }

  return {
    workspace: nextWorkspace,
    report: buildComplianceReport({ ...input, workspace: nextWorkspace }),
    appliedRemediation: remediation,
  };
}

import { type AppleSchemaCatalog } from "./apple-schema.js";
import { type RecommendationSource } from "./recommendation-types.js";
import { type PolicyWorkspace } from "./workspace.js";
import { type RelutionTemplateBundle } from "./templates.js";
import { loadRecommendationCatalog, loadRecommendationSettingBundleCatalog } from "./recommendations.js";
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
  ComplianceSourceCatalogs,
  ComplianceSourceStatus,
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
  ComplianceSourceCatalogs,
  ComplianceSourceStatus,
  ComplianceStatus,
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
    sourceStatuses,
    warnings,
    results,
    summary,
  };
}

export function loadComplianceArtifacts(
  sources: RecommendationSource[],
): Partial<Record<RecommendationSource, ComplianceSourceCatalogs>> {
  const artifacts: Partial<Record<RecommendationSource, ComplianceSourceCatalogs>> = {};
  for (const source of sources) {
    const recommendationCatalog = loadRecommendationCatalog(source);
    if (!recommendationCatalog.available) {
      artifacts[source] = { recommendationCatalog };
      continue;
    }
    let settingBundleCatalog: ReturnType<typeof loadRecommendationSettingBundleCatalog> | undefined;
    try {
      settingBundleCatalog = loadRecommendationSettingBundleCatalog(source);
    } catch (error) {
      const settingBundleCatalogError = error instanceof Error ? error.message : String(error);
      settingBundleCatalog = undefined;
      artifacts[source] = { recommendationCatalog, settingBundleCatalogError };
      continue;
    }
    artifacts[source] = settingBundleCatalog === undefined
      ? { recommendationCatalog }
      : { recommendationCatalog, settingBundleCatalog };
  }
  return artifacts;
}

function sourceStatus(source: RecommendationSource, artifacts: ComplianceSourceCatalogs | undefined): ComplianceSourceStatus {
  if (artifacts === undefined) {
    return {
      source,
      recommendationCatalog: "unavailable",
      settingBundleCatalog: "unavailable",
      warnings: [`${source} compliance artifacts were not loaded.`],
    };
  }
  if (!artifacts.recommendationCatalog.available) {
    return {
      source,
      recommendationCatalog: "unavailable",
      settingBundleCatalog: "unavailable",
      warnings: [`${source} recommendation catalog unavailable: ${artifacts.recommendationCatalog.error ?? "unknown error"}`],
    };
  }
  if (artifacts.settingBundleCatalog === undefined) {
    return {
      source,
      recommendationCatalog: "loaded",
      settingBundleCatalog: "degraded",
      warnings: [`${source} setting-bundle catalog unavailable: ${artifacts.settingBundleCatalogError ?? "unknown error"}`],
    };
  }
  return {
    source,
    recommendationCatalog: "loaded",
    settingBundleCatalog: "loaded",
    warnings: [],
  };
}

export function applyComplianceRemediationToWorkspace(input: ApplyComplianceRemediationInput): ApplyComplianceRemediationResult {
  // Remediation is deliberately report-driven: first compute the same result the
  // UI shows, then apply the selected option to a clone. This keeps "what would
  // be fixed" and "what was fixed" on the same mapping rules.
  const report = buildComplianceReport(input);
  const result = report.results.find((candidate) => candidate.source === input.source && candidate.recommendationId === input.recommendationId);
  if (result === undefined) {
    throw new Error(`Compliance recommendation not found: ${input.source}:${input.recommendationId}`);
  }
  const remediation = result.remediationOptions.find((candidate) => candidate.id === input.remediationId);
  if (remediation === undefined) {
    throw new Error(`Compliance remediation not available: ${input.remediationId}`);
  }
  if (remediation.available === false) {
    throw new Error(`Compliance remediation unavailable: ${remediation.unavailableReason ?? input.remediationId}`);
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

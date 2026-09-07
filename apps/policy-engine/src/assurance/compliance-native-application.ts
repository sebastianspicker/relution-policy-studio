/** Applies native Relution compliance mappings and creates missing native configurations. */
import {
  candidatesWithSameNativeIdentity,
  configurationCandidates,
} from "./compliance-configurations.js";
import {
  applyOrCreateConfiguration,
  requireCandidateRecord,
  throwIfAmbiguousComplianceTarget,
} from "./compliance-configuration-application.js";
import { deepMergePreservingExistingUuids, deepSubsetMatch } from "./compliance-deep-values.js";
import type { JsonRecord } from "./compliance-types.js";
import type { RecommendationSettingBundle } from "./recommendation-types.js";
import { findTemplate, type RelutionTemplateBundle } from "../contracts/template.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { createConfiguration } from "../workspace/workspace-configuration-builder.js";

export function applyNativeBundle(
  configurations: JsonRecord[],
  bundle: RecommendationSettingBundle,
  templateBundle: RelutionTemplateBundle,
): void {
  applyNativeValues(configurations, bundle.targetType, asRecord(bundle.details) ?? {}, templateBundle);
}

export function applyNativeValues(
  configurations: JsonRecord[],
  targetType: string,
  values: JsonRecord,
  templateBundle: RelutionTemplateBundle,
): void {
  const candidates = configurationCandidates(configurations, (details) => details.type === targetType);
  const matches = (entry: { details: JsonRecord }) => deepSubsetMatch(values, entry.details);
  const sameIdentity = candidatesWithSameNativeIdentity(targetType, values, candidates);
  throwIfAmbiguousComplianceTarget(targetType, sameIdentity.length, "multiple target settings share the same identity");
  const updateCandidate = (candidateRecord: JsonRecord) => {
    candidateRecord.details = deepMergePreservingExistingUuids(asRecord(candidateRecord.details) ?? {}, values);
  };
  if (candidates.some(matches)) return;
  if (sameIdentity.length === 1) {
    updateCandidate(requireCandidateRecord(configurations, sameIdentity[0]!, targetType, "configuration"));
    return;
  }
  if (targetType === "WINDOWS_CUSTOM_CSP") {
    configurations.push(createNativeConfiguration(targetType, values, templateBundle));
    return;
  }
  applyOrCreateConfiguration({
    configurations,
    candidates,
    target: targetType,
    targetLabel: "native configuration",
    ambiguityReason: "multiple target settings exist",
    matches,
    updateCandidate,
    createCandidate: () => createNativeConfiguration(targetType, values, templateBundle),
  });
}

function createNativeConfiguration(
  targetType: string,
  values: JsonRecord,
  templateBundle: RelutionTemplateBundle,
): JsonRecord {
  const template = findTemplate(templateBundle, targetType);
  if (template === undefined) throw new Error(`Relution template not found for ${targetType}`);
  const createdRecord = asRecord(createConfiguration(template, templateBundle));
  if (createdRecord === undefined) throw new Error(`Failed to create configuration for ${targetType}`);
  createdRecord.details = deepMergePreservingExistingUuids(asRecord(createdRecord.details) ?? {}, values);
  return createdRecord;
}

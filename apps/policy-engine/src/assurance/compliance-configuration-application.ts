/** Applies a compliance value set to one unambiguous configuration target. */
import type { ComplianceConfigurationCandidate } from "./compliance-configurations.js";
import type { JsonRecord } from "./compliance-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export interface ConfigurationApplication {
  readonly configurations: JsonRecord[];
  readonly candidates: ComplianceConfigurationCandidate[];
  readonly target: string;
  readonly targetLabel: string;
  readonly ambiguityReason: string;
  readonly matches: (candidate: ComplianceConfigurationCandidate) => boolean;
  readonly updateCandidate: (candidateRecord: JsonRecord) => void;
  readonly createCandidate: () => JsonRecord;
}

export function applyOrCreateConfiguration(params: ConfigurationApplication): void {
  if (params.candidates.some(params.matches)) return;
  throwIfAmbiguousComplianceTarget(params.target, params.candidates.length, params.ambiguityReason);
  const candidate = params.candidates[0];
  if (candidate === undefined) {
    params.configurations.push(params.createCandidate());
    return;
  }
  params.updateCandidate(requireCandidateRecord(params.configurations, candidate, params.target, params.targetLabel));
}

export function throwIfAmbiguousComplianceTarget(target: string, candidateCount: number, reason: string): void {
  if (candidateCount > 1) throw new Error(`Compliance apply is ambiguous for ${target}: ${reason}`);
}

export function requireCandidateRecord(
  configurations: JsonRecord[],
  candidate: ComplianceConfigurationCandidate,
  target: string,
  targetLabel: string,
): JsonRecord {
  const record = asRecord(configurations[candidate.reference.configurationIndex]);
  if (record === undefined) throw new Error(`Target ${targetLabel} is invalid for ${target}`);
  return record;
}

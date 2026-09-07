/** Locates workspace configurations addressed by compliance mappings. */
import type { ComplianceConfigurationReference, JsonRecord } from "./compliance-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export interface ComplianceConfigurationCandidate {
  details: JsonRecord;
  reference: ComplianceConfigurationReference;
}

export function configurationCandidates(
  configurations: JsonRecord[],
  predicate: (details: JsonRecord) => boolean,
): ComplianceConfigurationCandidate[] {
  return configurations.flatMap((configuration, configurationIndex) => {
    const details = asRecord(configuration.details);
    if (details === undefined || !predicate(details)) {
      return [];
    }
    return [{ details, reference: configurationReference(details, configurationIndex) }];
  });
}

/** Narrows Windows CSP candidates to the independently addressable CSP name. */
export function candidatesWithSameNativeIdentity(
  type: string,
  values: JsonRecord,
  candidates: ComplianceConfigurationCandidate[],
): ComplianceConfigurationCandidate[] {
  return type === "WINDOWS_CUSTOM_CSP" && typeof values.name === "string" && values.name.length > 0
    ? candidates.filter((candidate) => candidate.details.name === values.name)
    : [];
}

function configurationReference(details: JsonRecord, configurationIndex: number): ComplianceConfigurationReference {
  const label = typeof details.displayName === "string" && details.displayName.length > 0
    ? details.displayName
    : typeof details.type === "string" && details.type.length > 0
      ? details.type
      : `Configuration ${configurationIndex + 1}`;
  const reference: ComplianceConfigurationReference = {
    configurationIndex,
    type: typeof details.type === "string" ? details.type : "UNKNOWN",
    label,
  };
  if (typeof details.secondLevelPayloadType === "string" && details.secondLevelPayloadType.length > 0) {
    reference.payloadType = details.secondLevelPayloadType;
  }
  return reference;
}

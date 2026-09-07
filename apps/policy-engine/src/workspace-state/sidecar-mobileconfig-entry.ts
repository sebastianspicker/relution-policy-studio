/** Converts one mobileconfig configuration into a sidecar restore record. */
import { inspectMobileConfigText } from "../platform/serialization/plist-inspection.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";
import type { MobileConfigRestoreEntry } from "./sidecar-types.js";

export function mobileConfigRestoreEntryForConfiguration(
  policyPath: string,
  policyName: string,
  platform: string,
  version: JsonRecord | undefined,
  versionIndex: number,
  configuration: unknown,
): MobileConfigRestoreEntry[] {
  const record = isSidecarRecord(configuration) ? configuration : undefined;
  const details = isSidecarRecord(record?.details) ? record.details : undefined;
  if (details?.type !== "APPLE_MOBILECONFIG") return [];
  const inspection = inspectMobileConfigText(typeof details.rawContent === "string" ? details.rawContent : "");
  return [{
    policyPath,
    policyName,
    platform,
    configurationUuid: typeof record?.uuid === "string" ? record.uuid : "",
    ...(typeof version?.uuid === "string" ? { versionUuid: version.uuid } : {}),
    versionIndex,
    payloadType: typeof details.secondLevelPayloadType === "string" ? details.secondLevelPayloadType : inspection.secondLevelPayloadType,
    displayName: typeof details.displayName === "string" ? details.displayName : inspection.displayName,
    signatureState: typeof details.mobileConfigSignatureState === "string" ? details.mobileConfigSignatureState : inspection.signatureState,
    configuration: structuredClone(record ?? {}) as Record<string, unknown>,
  }];
}

export function isSidecarRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

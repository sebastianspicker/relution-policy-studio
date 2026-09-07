/** Updates editable mobileconfig details while preserving signed payload opacity. */
import { inspectMobileConfigText } from "../../../src/browser/json.js";
import { asRecord } from "./editor-record-utils.js";
import { parseMobileConfig } from "./mobileconfig-plist-parser.js";
import type { JsonRecord } from "./editor-contracts.js";

const PAYLOAD_TYPE_NAMES = { Command: "COMMAND", Configuration: "CONFIGURATION" } as const;
type PayloadTypeKind = keyof typeof PAYLOAD_TYPE_NAMES;

export function updateMobileConfigDetails(details: JsonRecord, rawContent: string): JsonRecord {
  if (rawContent.trim().length === 0) return emptyMobileConfigDetails(details, rawContent);
  const inspection = inspectMobileConfigText(rawContent);
  if (inspection.signatureState !== "unsigned") {
    if (inspection.signatureState === "signed-invalid") {
      // A malformed XML/plist is not a signed profile. Parse it so callers can
      // surface the validation error instead of silently preserving stale data.
      parseMobileConfig(rawContent);
    }
    return {
      ...details,
      displayName: inspection.displayName,
      rawContent,
      payloadContent: {},
      firstLevelPayloadType: inspection.firstLevelPayloadType,
      secondLevelPayloadType: inspection.secondLevelPayloadType,
      mobileConfigSignatureState: inspection.signatureState,
    };
  }
  const parsed = parseMobileConfig(rawContent);
  const payloadContent = Array.isArray(parsed.PayloadContent) ? parsed.PayloadContent : [];
  const firstPayload = asRecord(payloadContent[0]) ?? {};
  return {
    ...details,
    displayName: mobileConfigDisplayName(parsed, firstPayload, details),
    rawContent,
    payloadContent: firstPayload,
    firstLevelPayloadType: payloadTypeName(parsed.PayloadType),
    secondLevelPayloadType: typeof firstPayload.PayloadType === "string" ? firstPayload.PayloadType : "",
    mobileConfigSignatureState: "unsigned",
  };
}

function emptyMobileConfigDetails(details: JsonRecord, rawContent: string): JsonRecord {
  return { ...details, rawContent, payloadContent: {}, firstLevelPayloadType: "CONFIGURATION", secondLevelPayloadType: "", mobileConfigSignatureState: "unknown" };
}

function mobileConfigDisplayName(parsed: JsonRecord, firstPayload: JsonRecord, details: JsonRecord): string {
  if (typeof parsed.PayloadDisplayName === "string") return parsed.PayloadDisplayName;
  if (typeof firstPayload.PayloadDisplayName === "string") return firstPayload.PayloadDisplayName;
  return typeof details.displayName === "string" ? details.displayName : "Custom .mobileconfig";
}

export function invalidateMobileConfigDetails(details: JsonRecord, rawContent: string): JsonRecord {
  const inspection = inspectMobileConfigText(rawContent);
  return {
    ...details,
    rawContent,
    payloadContent: {},
    firstLevelPayloadType: inspection.firstLevelPayloadType.length > 0 ? inspection.firstLevelPayloadType : "CONFIGURATION",
    secondLevelPayloadType: "",
    mobileConfigSignatureState: "signed-invalid",
  };
}

function payloadTypeName(value: unknown): (typeof PAYLOAD_TYPE_NAMES)[PayloadTypeKind] {
  return isPayloadTypeKind(value) ? PAYLOAD_TYPE_NAMES[value] : PAYLOAD_TYPE_NAMES.Configuration;
}

function isPayloadTypeKind(value: unknown): value is PayloadTypeKind {
  return typeof value === "string" && Object.hasOwn(PAYLOAD_TYPE_NAMES, value);
}

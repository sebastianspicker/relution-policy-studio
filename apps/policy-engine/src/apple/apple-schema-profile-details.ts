/** Creates Apple schema profile configuration envelopes and preserves their editor metadata. */
import { plistValueFromUnknown } from "./plist-values.js";
import type { PlistValue } from "./plist-types.js";
import { createAppleProfileConfiguration, createAppleProfileDetails } from "./apple-profile.js";
import { appleSchemaPayloadFromValues } from "./apple-schema-payload.js";
import { normalizeAppleSchemaValues } from "./apple-schema-normalization.js";
import type { AppleSchemaEntry, AppleSchemaProfileCreateOptions, AppleSchemaValues } from "./apple-schema-types.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";

const PROFILE_IDENTIFIER_PREFIX = "io.rexp-studio.apple-schema";

export function createAppleSchemaProfileConfiguration(
  entry: AppleSchemaEntry,
  values: AppleSchemaValues = {},
  options: AppleSchemaProfileCreateOptions = {},
): JsonRecord {
  return createAppleProfileConfiguration(() => createAppleSchemaProfileDetails(entry, values, undefined, undefined, options), options);
}

export function updateAppleSchemaProfileDetails(
  details: JsonRecord,
  entry: AppleSchemaEntry,
  values: AppleSchemaValues,
  options: Pick<AppleSchemaProfileCreateOptions, "uuidFactory"> = {},
): JsonRecord {
  return createAppleSchemaProfileDetails(entry, values, details, undefined, options);
}

export function createAppleSchemaProfileDetails(
  entry: AppleSchemaEntry,
  values: AppleSchemaValues,
  previousDetails?: JsonRecord,
  nextPayloadOverrides?: JsonRecord,
  options: Pick<AppleSchemaProfileCreateOptions, "uuidFactory"> = {},
): JsonRecord {
  const normalizedValues = normalizeAppleSchemaValues(entry, values);
  return createAppleProfileDetails({
    ...(previousDetails === undefined ? {} : { previousDetails }),
    title: entry.title,
    itemId: entry.id,
    payloadType: entry.identifier,
    identifierPrefix: PROFILE_IDENTIFIER_PREFIX,
    ...(options.uuidFactory === undefined ? {} : { uuidFactory: options.uuidFactory }),
    createPayload: (previousMeta, identifiers) => appleSchemaProfilePayload(entry, normalizedValues, identifiers.payloadUuid, identifiers.payloadIdentifier, nextPayloadOverrides ?? payloadOverridesFromMetadata(previousMeta)),
    createMetadata: (previousMeta, identifiers) => ({ schemaId: entry.id, schemaKind: entry.kind, sourcePath: entry.sourcePath, values: normalizedValues, payloadOverrides: nextPayloadOverrides ?? payloadOverridesFromMetadata(previousMeta), profileUuid: identifiers.profileUuid, payloadUuid: identifiers.payloadUuid }),
    additionalDetails: { mobileConfigSignatureState: "unsigned" },
  });
}

function appleSchemaProfilePayload(
  entry: AppleSchemaEntry,
  values: AppleSchemaValues,
  payloadUuid: string,
  payloadIdentifier: string,
  payloadOverrides: JsonRecord,
): Record<string, PlistValue> {
  return {
    PayloadDisplayName: entry.title,
    PayloadIdentifier: payloadIdentifier,
    PayloadType: entry.identifier,
    PayloadUUID: payloadUuid,
    PayloadVersion: 1,
    ...plistValueFromUnknown(payloadOverrides) as Record<string, PlistValue>,
    ...plistValueFromUnknown(appleSchemaPayloadFromValues(entry, values)) as Record<string, PlistValue>,
  };
}

function payloadOverridesFromMetadata(metadata: JsonRecord | undefined): JsonRecord {
  const value = metadata?.payloadOverrides;
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

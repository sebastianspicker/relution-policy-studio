/** Reads and updates Apple schema profile payload-body JSON without exposing raw plist XML. */
import { omitPayloadShell, parsePayloadBodyJson, unknownPayloadOverrides } from "./apple-payload-json.js";
import { appleSchemaMetadata } from "./apple-schema-catalog-access.js";
import { normalizeAppleSchemaValues } from "./apple-schema-normalization.js";
import { knownAppleSchemaPayloadKeys, appleSchemaPayloadFromValues } from "./apple-schema-payload.js";
import { appleSchemaPayloadBodyToJsonRecord } from "./apple-schema-payload-json.js";
import { appleSchemaValuesFromPayloadBody } from "./apple-schema-payload-values.js";
import { createAppleSchemaProfileDetails } from "./apple-schema-profile-details.js";
import { newAppleProfileUuid } from "./apple-profile.js";
import type { AppleSchemaEntry, AppleSchemaValues, DdmArtifact, MdmCommandArtifact } from "./apple-schema-types.js";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";

export function extractAppleSchemaPayloadBodyJson(details: JsonRecord | undefined, entry: AppleSchemaEntry): string {
  return JSON.stringify(extractAppleSchemaPayloadBody(details, entry), null, 2);
}

export function updateAppleSchemaProfileDetailsFromPayloadBodyJson(
  details: JsonRecord,
  entry: AppleSchemaEntry,
  payloadBodyJson: string,
): JsonRecord {
  const payloadBody = parsePayloadBodyJson(payloadBodyJson);
  const values = appleSchemaValuesFromPayloadBody(entry, payloadBody);
  const payloadOverrides = unknownPayloadOverrides(payloadBody, knownAppleSchemaPayloadKeys(entry));
  return createAppleSchemaProfileDetails(entry, values, details, payloadOverrides);
}

export function extractAppleSchemaValues(details: JsonRecord | undefined, entry: AppleSchemaEntry): AppleSchemaValues {
  const stored = asRecord(appleSchemaMetadata(details)?.values) ?? {};
  const values: AppleSchemaValues = {};
  for (const field of entry.fields) {
    if (hasOwn(stored, field.path)) {
      values[field.path] = stored[field.path];
      continue;
    }
    if (field.required) {
      values[field.path] = field.defaultValue;
    }
  }
  return values;
}

export function createDdmArtifact(entry: AppleSchemaEntry, values: AppleSchemaValues = {}): DdmArtifact {
  const normalized = normalizeAppleSchemaValues(entry, values);
  return { uuid: newAppleProfileUuid(), schemaId: entry.id, kind: entry.kind, identifier: entry.identifier, title: entry.title, values: normalized, payload: appleSchemaPayloadFromValues(entry, normalized) };
}

export function createMdmCommandArtifact(entry: AppleSchemaEntry, values: AppleSchemaValues = {}): MdmCommandArtifact {
  const normalized = normalizeAppleSchemaValues(entry, values);
  return { uuid: newAppleProfileUuid(), schemaId: entry.id, requestType: entry.identifier, title: entry.title, values: normalized, payload: { RequestType: entry.identifier, ...appleSchemaPayloadFromValues(entry, normalized) } };
}

function extractAppleSchemaPayloadBody(details: JsonRecord | undefined, entry: AppleSchemaEntry): JsonRecord {
  const payload = asRecord(asRecord(details?.payloadContent)?.payload);
  if (payload !== undefined) {
    return appleSchemaPayloadBodyToJsonRecord(omitPayloadShell(payload));
  }
  const values = extractAppleSchemaValues(details, entry);
  return appleSchemaPayloadBodyToJsonRecord(appleSchemaPayloadFromValues(entry, normalizeAppleSchemaValues(entry, values)));
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

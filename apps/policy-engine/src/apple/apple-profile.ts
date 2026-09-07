/** Builds Apple configuration-profile envelopes and shared profile metadata. */
import { buildMobileConfig } from "./plist-render.js";
import type { PlistValue } from "./plist-types.js";
import { PROFILE_EDITOR_META_PROPERTY } from "./profile-editor-meta.js";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";

export interface AppleProfileCreateOptions { uuidFactory?: () => string; now?: () => number; }
export interface AppleProfileIdentifiers { detailUuid: string; enabled: boolean; profileUuid: string; payloadUuid: string; profileIdentifier: string; payloadIdentifier: string; }
export interface AppleProfileDetailsInput {
  previousDetails?: JsonRecord; title: string; itemId: string; payloadType: string; identifierPrefix: string; uuidFactory?: () => string;
  createPayload: (previousMetadata: JsonRecord | undefined, identifiers: AppleProfileIdentifiers) => Record<string, PlistValue>;
  createMetadata: (previousMetadata: JsonRecord | undefined, identifiers: AppleProfileIdentifiers) => JsonRecord;
  additionalDetails?: JsonRecord;
}

export function createAppleProfileConfiguration(createDetails: () => JsonRecord, options: AppleProfileCreateOptions = {}): JsonRecord {
  const now = options.now?.() ?? Date.now();
  return { uuid: newAppleProfileUuid(options.uuidFactory), createdBy: "local", creationDate: now, modifiedBy: "local", modificationDate: now, details: createDetails() };
}

export function createAppleProfileDetails(input: AppleProfileDetailsInput): JsonRecord {
  const previousMetadata = appleProfileMetadata(input.previousDetails);
  const detailUuid = stringValue(input.previousDetails?.uuid) ?? newAppleProfileUuid(input.uuidFactory);
  const enabled = typeof input.previousDetails?.enabled === "boolean" ? input.previousDetails.enabled : true;
  const profileUuid = stringValue(previousMetadata?.profileUuid) ?? newAppleProfileUuid(input.uuidFactory);
  const payloadUuid = stringValue(previousMetadata?.payloadUuid) ?? newAppleProfileUuid(input.uuidFactory);
  const identifiers = { detailUuid, enabled, profileUuid, payloadUuid, payloadIdentifier: `${input.identifierPrefix}.payload.${input.itemId}.${payloadUuid.toLowerCase()}`, profileIdentifier: `${input.identifierPrefix}.profile.${input.itemId}.${profileUuid.toLowerCase()}` } satisfies AppleProfileIdentifiers;
  const payload = input.createPayload(previousMetadata, identifiers);
  const profile = { PayloadContent: [payload], PayloadDisplayName: input.title, PayloadIdentifier: identifiers.profileIdentifier, PayloadRemovalDisallowed: false, PayloadType: "Configuration", PayloadUUID: identifiers.profileUuid, PayloadVersion: 1 } satisfies Record<string, PlistValue>;
  return { uuid: identifiers.detailUuid, enabled: identifiers.enabled, type: "APPLE_MOBILECONFIG", displayName: input.title, rawContent: buildMobileConfig(profile), payloadContent: { [PROFILE_EDITOR_META_PROPERTY]: input.createMetadata(previousMetadata, identifiers), payload }, firstLevelPayloadType: "CONFIGURATION", secondLevelPayloadType: input.payloadType, ...input.additionalDetails };
}

export function appleProfileMetadata(details: JsonRecord | undefined): JsonRecord | undefined { return asRecord(asRecord(details?.payloadContent)?.[PROFILE_EDITOR_META_PROPERTY]); }

export function newAppleProfileUuid(uuidFactory?: () => string): string {
  if (uuidFactory !== undefined) return uuidFactory();
  const runtimeCrypto = globalThis.crypto;
  if (runtimeCrypto !== undefined && typeof runtimeCrypto.randomUUID === "function") return runtimeCrypto.randomUUID().toUpperCase();
  if (runtimeCrypto !== undefined && typeof runtimeCrypto.getRandomValues === "function") {
    const bytes = runtimeCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [hex.slice(0, 4).join(""), hex.slice(4, 6).join(""), hex.slice(6, 8).join(""), hex.slice(8, 10).join(""), hex.slice(10, 16).join("")].join("-").toUpperCase();
  }
  throw new Error("A cryptographic random source is required to generate Apple schema UUIDs");
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }

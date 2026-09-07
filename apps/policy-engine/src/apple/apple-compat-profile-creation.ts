/** Creates and updates Apple compatibility configuration envelopes. */
import type { JsonRecord } from "./apple-compat-types.js";
import { PROFILE_IDENTIFIER_PREFIX, type AppleCompatSetting } from "./apple-compat-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { createAppleProfileConfiguration, createAppleProfileDetails, type AppleProfileIdentifiers } from "./apple-profile.js";
import { createAppleCompatPayload } from "./apple-compat-payload-build.js";
import { requireAppleCompatSetting } from "./apple-compat-setting-lookup.js";
import { normalizeAppleCompatValues } from "./apple-compat-values-normalization.js";

export interface AppleCompatCreateOptions {
  uuidFactory?: () => string;
  now?: () => number;
}

export function createAppleCompatConfiguration(
  settingId: string,
  values: JsonRecord = {},
  options: AppleCompatCreateOptions = {},
): JsonRecord {
  const setting = requireAppleCompatSetting(settingId);
  return createAppleProfileConfiguration(
    () => createAppleCompatDetails(setting, values, undefined, undefined, options.uuidFactory),
    options,
  );
}

export function updateAppleCompatDetails(
  details: JsonRecord,
  settingId: string,
  values: JsonRecord,
  options: Pick<AppleCompatCreateOptions, "uuidFactory"> = {},
): JsonRecord {
  return createAppleCompatDetails(requireAppleCompatSetting(settingId), values, details, undefined, options.uuidFactory);
}

export function createAppleCompatDetails(
  setting: AppleCompatSetting,
  values: JsonRecord,
  previousDetails?: JsonRecord,
  nextPayloadOverrides?: JsonRecord,
  uuidFactory?: () => string,
): JsonRecord {
  const normalizedValues = normalizeAppleCompatValues(setting, values, previousDetails);
  return createAppleProfileDetails({
    ...(previousDetails === undefined ? {} : { previousDetails }),
    title: setting.label,
    itemId: setting.id,
    payloadType: setting.payloadType,
    identifierPrefix: PROFILE_IDENTIFIER_PREFIX,
    ...(uuidFactory === undefined ? {} : { uuidFactory }),
    createPayload: (previousMeta, identifiers) => createAppleCompatPayload(
      setting, normalizedValues, identifiers, nextPayloadOverrides ?? asRecord(previousMeta?.payloadOverrides) ?? {},
    ),
    createMetadata: (previousMeta, identifiers) => appleCompatMetadata(
      setting, normalizedValues, nextPayloadOverrides ?? asRecord(previousMeta?.payloadOverrides) ?? {}, identifiers,
    ),
  });
}

function appleCompatMetadata(
  setting: AppleCompatSetting,
  values: JsonRecord,
  payloadOverrides: JsonRecord,
  identifiers: AppleProfileIdentifiers,
): JsonRecord {
  return { settingId: setting.id, values, payloadOverrides, profileUuid: identifiers.profileUuid, payloadUuid: identifiers.payloadUuid };
}

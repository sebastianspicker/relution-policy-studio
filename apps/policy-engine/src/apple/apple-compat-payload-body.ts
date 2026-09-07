/** Exposes editable Apple compatibility payload JSON bodies. */
import type { AppleCompatSetting, JsonRecord } from "./apple-compat-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { omitPayloadShell, parsePayloadBodyJson, unknownPayloadOverrides } from "./apple-payload-json.js";
import { createAppleCompatPayload } from "./apple-compat-payload-build.js";
import { requireAppleCompatSetting } from "./apple-compat-setting-lookup.js";
import { extractAppleCompatValues } from "./apple-compat-values-normalization.js";
import { knownPayloadKeysForAppleCompatSetting } from "./apple-compat-payload-build.js";
import { createAppleCompatDetails, updateAppleCompatDetails } from "./apple-compat-profile-creation.js";
import { firstEntry, stringValue } from "./apple-compat-value-primitives.js";

export function extractAppleCompatPayloadBodyJson(details: JsonRecord | undefined, setting: AppleCompatSetting): string {
  return JSON.stringify(extractAppleCompatPayloadBody(details, setting), null, 2);
}

export function updateAppleCompatDetailsFromPayloadBodyJson(
  details: JsonRecord,
  settingId: string,
  payloadBodyJson: string,
): JsonRecord {
  const setting = requireAppleCompatSetting(settingId);
  const payloadBody = parsePayloadBodyJson(payloadBodyJson, `setting ${settingId} payload body`);
  if (setting.builder === "generic-json") {
    return updateAppleCompatDetails(details, settingId, { payloadKeysJson: JSON.stringify(payloadBody, null, 2) });
  }
  const payloadOverrides = unknownPayloadOverrides(payloadBody, knownPayloadKeysForAppleCompatSetting(setting));
  return createAppleCompatDetailsFromPayloadBody(details, setting, payloadBody, payloadOverrides);
}

function extractAppleCompatPayloadBody(details: JsonRecord | undefined, setting: AppleCompatSetting): JsonRecord {
  const payload = asRecord(asRecord(details?.payloadContent)?.payload);
  if (payload !== undefined) {
    return omitPayloadShell(payload);
  }
  return omitPayloadShell(createAppleCompatPayload(
    setting,
    extractAppleCompatValues(details, setting),
    { payloadUuid: "", payloadIdentifier: "" },
    {},
  ));
}

function createAppleCompatDetailsFromPayloadBody(
  details: JsonRecord,
  setting: AppleCompatSetting,
  payloadBody: JsonRecord,
  payloadOverrides: JsonRecord,
): JsonRecord {
  return createAppleCompatDetails(setting, valuesFromAppleCompatPayloadBody(setting, payloadBody), details, payloadOverrides);
}

function valuesFromAppleCompatPayloadBody(setting: AppleCompatSetting, payloadBody: JsonRecord): JsonRecord {
  const values = extractAppleCompatValues(undefined, setting);
  switch (setting.builder) {
    case "pppc": {
      const [service, rules] = firstEntry(asRecord(payloadBody.Services));
      const rule = Array.isArray(rules) ? asRecord(rules[0]) : undefined;
      return { ...values, service: service ?? values.service, authorization: stringValue(rule?.Authorization) ?? values.authorization, codeRequirement: stringValue(rule?.CodeRequirement) ?? values.codeRequirement, identifier: stringValue(rule?.Identifier) ?? values.identifier, identifierType: stringValue(rule?.IdentifierType) ?? values.identifierType };
    }
    case "managed-preferences": {
      const [domain, domainPayload] = firstEntry(asRecord(payloadBody.PayloadContent));
      const forced = asRecord(domainPayload)?.Forced;
      const [key, value] = firstEntry(asRecord(Array.isArray(forced) ? asRecord(forced[0])?.mcx_preference_settings : undefined));
      return { ...values, domain: domain ?? values.domain, key: key ?? values.key, value: value === undefined ? values.value : JSON.stringify(value, null, 2) };
    }
    case "associated-domains":
      return { ...values, applicationIdentifier: stringValue(payloadBody.ApplicationIdentifier) ?? values.applicationIdentifier, associatedDomains: Array.isArray(payloadBody.AssociatedDomains) ? payloadBody.AssociatedDomains.filter((entry): entry is string => typeof entry === "string") : values.associatedDomains };
    case "managed-login-items": {
      const rule = asRecord(Array.isArray(payloadBody.Rules) ? payloadBody.Rules[0] : undefined);
      return { ...values, comment: stringValue(rule?.Comment) ?? values.comment, bundleIdentifier: stringValue(rule?.RuleValue) ?? values.bundleIdentifier, teamIdentifier: stringValue(rule?.TeamIdentifier) ?? values.teamIdentifier };
    }
    case "generic-json":
      return { ...values, payloadKeysJson: JSON.stringify(payloadBody, null, 2) };
  }
}

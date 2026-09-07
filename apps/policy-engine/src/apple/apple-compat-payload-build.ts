/** Builds a complete second-level Apple compatibility payload. */
import type { AppleCompatSetting, JsonRecord } from "./apple-compat-types.js";
import { jsonPayloadKeys, plistValueFromUnknown } from "./plist-values.js";
import type { PlistValue } from "./plist-types.js";
import { parsePayloadKeysJson } from "./apple-payload-json.js";
import { listValue, stringValue } from "./apple-compat-value-primitives.js";
import { extractAppleCompatValues } from "./apple-compat-values-normalization.js";

export interface AppleCompatPayloadIdentifiers {
  payloadUuid: string;
  payloadIdentifier: string;
}

export function createAppleCompatPayload(
  setting: AppleCompatSetting,
  values: JsonRecord,
  identifiers: AppleCompatPayloadIdentifiers,
  payloadOverrides: JsonRecord,
): Record<string, PlistValue> {
  const payload = { ...payloadShell(setting, identifiers), ...jsonPayloadKeys(payloadOverrides) };
  switch (setting.builder) {
    case "pppc":
      return {
        ...payload,
        Services: { [stringValue(values.service) ?? "Accessibility"]: [{
          Authorization: stringValue(values.authorization) ?? "Allow",
          CodeRequirement: stringValue(values.codeRequirement) ?? "",
          Identifier: stringValue(values.identifier) ?? "",
          IdentifierType: stringValue(values.identifierType) ?? "bundleID",
        }] },
      };
    case "managed-preferences":
      return {
        ...payload,
        PayloadContent: { [stringValue(values.domain) ?? "com.example.app"]: {
          Forced: [{ mcx_preference_settings: { [stringValue(values.key) ?? "ExampleKey"]: plistValueFromUnknown(values.value ?? "") } }],
        } },
      };
    case "associated-domains":
      return { ...payload, ApplicationIdentifier: stringValue(values.applicationIdentifier) ?? "", AssociatedDomains: listValue(values.associatedDomains) };
    case "managed-login-items":
      return {
        ...payload,
        Rules: [{
          Comment: stringValue(values.comment) ?? "",
          RuleType: "BundleIdentifier",
          RuleValue: stringValue(values.bundleIdentifier) ?? "",
          TeamIdentifier: stringValue(values.teamIdentifier) ?? "",
        }],
      };
    case "generic-json":
      return { ...payloadShell(setting, identifiers), ...jsonPayloadKeys(parsePayloadKeysJson(values.payloadKeysJson, `setting ${setting.id} payload keys`)) };
  }
}

function payloadShell(setting: AppleCompatSetting, identifiers: AppleCompatPayloadIdentifiers): Record<string, PlistValue> {
  return {
    PayloadDisplayName: setting.label,
    PayloadIdentifier: identifiers.payloadIdentifier,
    PayloadType: setting.payloadType,
    PayloadUUID: identifiers.payloadUuid,
    PayloadVersion: 1,
  };
}

export function knownPayloadKeysForAppleCompatSetting(setting: AppleCompatSetting): Set<string> {
  switch (setting.builder) {
    case "pppc": return new Set(["Services"]);
    case "managed-preferences": return new Set(["PayloadContent"]);
    case "associated-domains": return new Set(["ApplicationIdentifier", "AssociatedDomains"]);
    case "managed-login-items": return new Set(["Rules"]);
    case "generic-json": return new Set(Object.keys(parsePayloadKeysJson(extractAppleCompatValues(undefined, setting).payloadKeysJson)));
  }
}

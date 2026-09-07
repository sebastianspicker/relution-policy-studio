/** Builds and parses the local Jamf-style custom-settings Apple schema profile. */
import type { AppleSchemaEntry, AppleSchemaField, AppleSchemaValues, CustomSettingsInput } from "./apple-schema-types.js";
import { asRecord, stringValue, type JsonRecord } from "../platform/serialization/json-guards.js";

export const CUSTOM_SETTINGS_ID = "jamf-application-custom-settings";

const CUSTOM_SETTINGS_PROFILE_ENTRY: Omit<AppleSchemaEntry, "title" | "fields"> = {
  id: CUSTOM_SETTINGS_ID,
  kind: "profile",
  description: "Jamf-style custom managed preferences payload.",
  identifier: "com.apple.ManagedClient.preferences",
  sourcePath: "local/custom-settings",
  availability: { platforms: ["MACOS"], allowMultiple: true, requiresMdm: false, deprecated: false, notes: [] },
  deprecated: false,
};

export function customSettingsSchemaEntry(input: CustomSettingsInput): AppleSchemaEntry {
  return {
    ...CUSTOM_SETTINGS_PROFILE_ENTRY,
    title: input.displayName ?? "Application & Custom Settings",
    fields: [
      { path: "domain", payloadKey: "PayloadContent", title: "Preference domain", kind: "string", required: true, description: "Preference domain.", defaultValue: input.domain, enumValues: [], variableSafe: true },
      { path: "settingsJson", payloadKey: "PayloadContent", title: "Managed settings JSON", kind: "json", required: true, description: "Managed preference key/value JSON.", defaultValue: input.settings, enumValues: [], variableSafe: false },
    ] satisfies AppleSchemaField[],
  };
}

export function customSettingsPayloadFromValues(values: AppleSchemaValues): Record<string, unknown> {
  const domain = stringValue(values.domain) ?? "com.example.app";
  return {
    PayloadContent: {
      [domain]: { Forced: [{ mcx_preference_settings: parseJsonRecord(values.settingsJson) }] },
    },
  };
}

export function customSettingsValuesFromPayloadBody(payloadBody: JsonRecord): AppleSchemaValues {
  const content = asRecord(payloadBody.PayloadContent) ?? {};
  const [domain, domainPayload] = Object.entries(content)[0] ?? ["com.example.app", undefined];
  const forced = asRecord(domainPayload)?.Forced;
  const firstForced = Array.isArray(forced) ? asRecord(forced[0]) : undefined;
  const settings = asRecord(firstForced?.mcx_preference_settings) ?? {};
  return { domain, settingsJson: JSON.stringify(settings, null, 2) };
}

function parseJsonRecord(value: unknown): JsonRecord {
  const parsed = typeof value === "string" ? JSON.parse(value.length === 0 ? "null" : value) as unknown : value;
  return asRecord(parsed) ?? {};
}

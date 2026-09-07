/** Builds Apple Application & Custom Settings profile configurations. */
import { customSettingsSchemaEntry } from "./apple-schema-custom-settings.js";
import { createAppleSchemaProfileConfiguration } from "./apple-schema-profile-details.js";
import type { CustomSettingsInput } from "./apple-schema-types.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";

export function createCustomSettingsConfiguration(input: CustomSettingsInput): JsonRecord {
  return createAppleSchemaProfileConfiguration(customSettingsSchemaEntry(input), {
    domain: input.domain,
    settingsJson: JSON.stringify(input.settings, null, 2),
  });
}

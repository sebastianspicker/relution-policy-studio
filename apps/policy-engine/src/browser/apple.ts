/** Pure Apple catalog helpers used by the browser; source harvesting and storage stay server-side. */
export type { AppleCompatField, AppleCompatObjectField, AppleCompatReport, AppleCompatSetting } from "../apple/apple-compat-types.js";
export type { AppleSchemaCatalog, AppleSchemaEntry, AppleSchemaField } from "../apple/apple-schema-types.js";
export { APPLE_COMPAT_HINT } from "../apple/apple-compat-settings.js";
export { appleCompatSettingsForPlatform, createAppleCompatConfiguration, extractAppleCompatPayloadBodyJson, extractAppleCompatValues, findAppleCompatSetting, findAppleCompatSettingForDetails, updateAppleCompatDetails, updateAppleCompatDetailsFromPayloadBodyJson } from "../apple/apple-compat-values.js";
export { appleSchemaEntriesForPlatform, findAppleSchemaProfileForDetails } from "../apple/apple-schema-catalog-access.js";
export { createAppleSchemaCounts } from "../apple/apple-schema-catalog-identifiers.js";
export { createAppleSchemaProfileConfiguration, updateAppleSchemaProfileDetails } from "../apple/apple-schema-profile-details.js";
export { extractAppleSchemaPayloadBodyJson, extractAppleSchemaValues, updateAppleSchemaProfileDetailsFromPayloadBodyJson } from "../apple/apple-schema-body.js";
export { findAppleSchemaEntry } from "../apple/apple-schema-catalog-access.js";

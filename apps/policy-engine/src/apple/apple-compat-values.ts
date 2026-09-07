/** Exposes Apple compatibility value conversion without coupling consumers to its internals. */
export {
  createAppleCompatConfiguration,
  updateAppleCompatDetails,
} from "./apple-compat-profile-creation.js";
export {
  extractAppleCompatPayloadBodyJson,
  updateAppleCompatDetailsFromPayloadBodyJson,
} from "./apple-compat-payload-body.js";
export { extractAppleCompatValues } from "./apple-compat-values-normalization.js";
export {
  appleCompatSettingsForPlatform,
  findAppleCompatSetting,
  findAppleCompatSettingForDetails,
} from "./apple-compat-setting-lookup.js";

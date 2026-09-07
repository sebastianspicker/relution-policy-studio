/** Finds mobileconfig-backed Apple compatibility settings and matches stored details. */
import type { AppleCompatSetting, JsonRecord } from "./apple-compat-types.js";
import { APPLE_COMPAT_SETTINGS } from "./apple-compat-settings.js";
import { appleProfileMetadata } from "./apple-profile.js";

export function appleCompatSettingsForPlatform(platform: string): AppleCompatSetting[] {
  return APPLE_COMPAT_SETTINGS.filter(
    (setting) => setting.status === "mobileconfig-backed" && setting.platforms.includes(platform),
  );
}

export function findAppleCompatSetting(id: string): AppleCompatSetting | undefined {
  return APPLE_COMPAT_SETTINGS.find((setting) => setting.id === id);
}

export function requireAppleCompatSetting(settingId: string): AppleCompatSetting {
  const setting = findAppleCompatSetting(settingId);
  if (setting === undefined || setting.status !== "mobileconfig-backed") {
    throw new Error(`Unsupported Apple compatibility setting: ${settingId}`);
  }
  return setting;
}

export function findAppleCompatSettingForDetails(details: JsonRecord | undefined): AppleCompatSetting | undefined {
  if (details?.type !== "APPLE_MOBILECONFIG" || typeof details.secondLevelPayloadType !== "string") {
    return undefined;
  }
  const meta = appleProfileMetadata(details);
  if (typeof meta?.settingId === "string") {
    return findAppleCompatSetting(meta.settingId);
  }
  return APPLE_COMPAT_SETTINGS.find(
    (setting) => setting.status === "mobileconfig-backed" && setting.payloadType === details.secondLevelPayloadType,
  );
}

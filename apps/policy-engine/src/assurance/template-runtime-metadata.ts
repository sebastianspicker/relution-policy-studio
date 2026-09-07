import type { RuntimeConfigurationTypeMetadata } from "../contracts/template.js";

const PORTAL_HIDDEN_TYPES = new Set([
  "IOS_LDAP", "IOS_SINGLE_SIGN_ON", "ANDROID_BLUETOOTH", "IOS_EDUCATION", "MACOS_ACCOUNT_SETUP",
  "ANDROID_ENTERPRISE_DISABLE_CAMERAS", "ANDROID_ENTERPRISE_SYSTEM_CLOCK_MANAGEMENT",
  "ANDROID_ENTERPRISE_SYSTEM_AUDIO_MANAGEMENT", "ANDROID_ENTERPRISE_SYSTEM_RADIO_MANAGEMENT",
]);

export function heuristicMetadata(type: string, allPlatforms: string[]): RuntimeConfigurationTypeMetadata {
  return {
    type,
    platforms: heuristicPlatforms(type, allPlatforms),
    enrollmentTypes: [],
    multiConfig: type.includes("CERTIFICATE") || type.includes("WIFI") || type.includes("VPN") || type.includes("SCRIPT"),
    placeholders: [],
    portalHidden: PORTAL_HIDDEN_TYPES.has(type),
  };
}

function heuristicPlatforms(type: string, allPlatforms: string[]): string[] {
  if (type.startsWith("ANDROID_ENTERPRISE_")) return ["ANDROID_ENTERPRISE"];
  if (type.startsWith("ANDROID_")) return ["ANDROID"];
  if (type.startsWith("IOS_") || type === "MSCA_REQUIRED") return ["IOS"];
  if (type.startsWith("MACOS_")) return ["MACOS"];
  if (type.startsWith("TVOS_") || type === "AIRPLAY_SECURITY") return ["TVOS"];
  if (type.startsWith("WINDOWS_")) return ["WINDOWS"];
  if (type.startsWith("CHROMEOS_")) return ["CHROMEOS"];
  if (type.startsWith("LINUX_")) return ["LINUX"];
  if (type.startsWith("APPLE_")) return ["IOS", "MACOS", "TVOS", "WATCHOS", "VISIONOS"].filter((platform) => allPlatforms.includes(platform));
  if (type.startsWith("IOT_")) return ["EDGEROUTER", "BLENODE", "ASSET", "BEACON", "KNX", "BACNET", "VIRTUAL", "LORAWAN"].filter((platform) => allPlatforms.includes(platform));
  return allPlatforms;
}

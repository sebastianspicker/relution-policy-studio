import type { RelutionTemplateBundle } from "./templates.js";
import type { AppleCompatReport, AppleCompatReportEntry } from "./apple-compat-types.js";
import {
  APPLE_PAYLOAD_MATRIX_SOURCE,
  APPLE_PROFILE_SOURCE,
  JAMF_MACOS_UPLOAD_SOURCE,
  JAMF_MOBILE_DEVICE_PROFILES_SOURCE,
  RELUTION_MOBILECONFIG_SOURCE,
} from "./apple-compat-types.js";
import { APPLE_COMPAT_SETTINGS } from "./apple-compat-settings.js";

const CURATED_NATIVE_RELUTION_TYPES: Record<string, string[]> = {
  "managed-login-items": ["MACOS_LOGIN_ITEMS"],
};

export function createAppleCompatReport(bundle: RelutionTemplateBundle): AppleCompatReport {
  const mobileconfig = bundle.configurationTypes.find((template) => template.type === "APPLE_MOBILECONFIG");
  const relutionNativeTypes = new Set(bundle.configurationTypes.map((template) => template.type));
  const settings = APPLE_COMPAT_SETTINGS.map((setting) => {
    const relutionNativeTypePresent =
      relutionNativeTypes.has(setting.payloadType) ||
      relutionNativeTypes.has(setting.id) ||
      (CURATED_NATIVE_RELUTION_TYPES[setting.id] ?? []).some((type) => relutionNativeTypes.has(type));
    const entry: AppleCompatReportEntry = {
      id: setting.id,
      label: setting.label,
      jamfFeature: setting.jamfFeature,
      payloadType: setting.payloadType,
      platforms: setting.platforms,
      status: setting.status,
      relutionNativeTypePresent,
      guiHint: setting.status === "mobileconfig-backed" ? `${setting.label} *` : setting.label,
      sourceUrls: setting.sourceUrls,
    };
    if (setting.relutionTransportType !== undefined) {
      entry.relutionTransportType = setting.relutionTransportType;
    }
    return entry;
  });
  const mobileconfigBacked = settings.filter((setting) => setting.status === "mobileconfig-backed").length;
  return {
    summary: {
      totalJamfGapSettings: settings.length,
      mobileconfigBacked,
      notMobileconfigWireable: settings.length - mobileconfigBacked,
      relutionHasMobileconfigTransport: mobileconfig !== undefined,
      relutionMobileconfigPlatforms: mobileconfig?.platforms ?? [],
    },
    sources: [
      APPLE_PROFILE_SOURCE,
      APPLE_PAYLOAD_MATRIX_SOURCE,
      JAMF_MOBILE_DEVICE_PROFILES_SOURCE,
      JAMF_MACOS_UPLOAD_SOURCE,
      RELUTION_MOBILECONFIG_SOURCE,
    ],
    settings,
  };
}

export function renderAppleCompatReportMarkdown(report: AppleCompatReport): string {
  const lines = [
    "# Jamf / Relution Apple Gap Matrix",
    "",
    `Relution APPLE_MOBILECONFIG transport: ${report.summary.relutionHasMobileconfigTransport ? "present" : "missing"}`,
    `Mobileconfig-backed gap settings: ${report.summary.mobileconfigBacked}`,
    `Not wireable via mobileconfig: ${report.summary.notMobileconfigWireable}`,
    "",
    "Settings marked with `*` in the editor are generated as Relution `APPLE_MOBILECONFIG` configurations.",
    "",
    "## Settings",
    "",
    "| Setting | Jamf feature | Apple payload | Platforms | Status | Relution transport |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const setting of report.settings) {
    lines.push(
      `| ${setting.label} | ${setting.jamfFeature} | \`${setting.payloadType}\` | ${setting.platforms.join(", ")} | ${setting.status} | ${setting.relutionTransportType ?? "-"} |`,
    );
  }
  lines.push("", "## Sources", "");
  for (const source of report.sources) {
    lines.push(`- ${source}`);
  }
  lines.push("");
  return lines.join("\n");
}

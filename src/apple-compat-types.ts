export type AppleCompatStatus = "mobileconfig-backed" | "not-mobileconfig-wireable";
export type AppleCompatScalarFieldKind = "string" | "textarea" | "boolean" | "integer" | "number" | "list" | "json" | "key-value-list";
export type AppleCompatFieldKind = AppleCompatScalarFieldKind | "object-list";

export interface AppleCompatObjectField {
  id: string;
  label: string;
  kind: AppleCompatScalarFieldKind;
  description: string;
  defaultValue: unknown;
  payloadKey?: string;
  options?: string[];
}

export interface AppleCompatField {
  id: string;
  label: string;
  kind: AppleCompatFieldKind;
  description: string;
  defaultValue: unknown;
  payloadKey?: string;
  options?: string[];
  itemFields?: AppleCompatObjectField[];
}

export interface AppleCompatSetting {
  id: string;
  label: string;
  payloadType: string;
  platforms: string[];
  status: AppleCompatStatus;
  jamfFeature: string;
  relutionTransportType?: "APPLE_MOBILECONFIG";
  description: string;
  sourceUrls: string[];
  fields: AppleCompatField[];
  builder: AppleCompatBuilder;
}

export interface AppleCompatReport {
  summary: {
    totalJamfGapSettings: number;
    mobileconfigBacked: number;
    notMobileconfigWireable: number;
    relutionHasMobileconfigTransport: boolean;
    relutionMobileconfigPlatforms: string[];
  };
  sources: string[];
  settings: AppleCompatReportEntry[];
}

export interface AppleCompatReportEntry {
  id: string;
  label: string;
  jamfFeature: string;
  payloadType: string;
  platforms: string[];
  status: AppleCompatStatus;
  relutionTransportType?: "APPLE_MOBILECONFIG";
  relutionNativeTypePresent: boolean;
  guiHint: string;
  sourceUrls: string[];
}

export type AppleCompatBuilder = "pppc" | "managed-preferences" | "associated-domains" | "managed-login-items" | "generic-json";
export type JsonRecord = Record<string, unknown>;

export { PROFILE_EDITOR_META_KEY } from "./profile-editor-meta.js";
export const PROFILE_IDENTIFIER_PREFIX = "io.relution-policy-workbench.apple-gap";
export const APPLE_COMMON_PLATFORMS = ["IOS", "MACOS", "TVOS", "WATCHOS", "VISIONOS"];
export const APPLE_PROFILE_SOURCE = "https://developer.apple.com/documentation/devicemanagement/profile-specific-payload-keys";
export const APPLE_PAYLOAD_MATRIX_SOURCE = "https://support.apple.com/guide/deployment/intro-to-device-management-payloads-depd73c1b83c/web";
export const JAMF_MOBILE_DEVICE_PROFILES_SOURCE = "https://learn.jamf.com/en-US/bundle/jamf-pro-documentation-current/page/Mobile_Device_Configuration_Profiles.html";
export const JAMF_MACOS_UPLOAD_SOURCE = "https://learn.jamf.com/en-US/bundle/jamf-pro-documentation-current/page/Computer_Configuration_Profiles.html";
export const RELUTION_MOBILECONFIG_SOURCE = "https://hub.relution.io/en/docs/apple-tvos/policies/apple-configurator-2/";

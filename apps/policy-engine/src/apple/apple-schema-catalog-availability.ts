/** Derives platform availability and enrollment requirements from Apple YAML metadata. */
import type { AppleAvailability, AppleSchemaKind } from "./apple-schema-types.js";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";

const RELUTION_PLATFORMS: Record<string, string> = {
  iOS: "IOS",
  iPadOS: "IOS",
  macOS: "MACOS",
  tvOS: "TVOS",
  watchOS: "WATCHOS",
  visionOS: "VISIONOS",
};
const AVAILABILITY_NOTES: Array<[keyof JsonRecord, string]> = [
  ["supervised", "Requires supervised devices on at least one platform."],
  ["requiresdep", "Requires automated device enrollment on at least one platform."],
  ["userapprovedmdm", "Requires user-approved MDM on at least one platform."],
];

export function appleSchemaAvailability(kind: AppleSchemaKind, payload: JsonRecord, deprecated: boolean): AppleAvailability {
  const supported = asRecord(payload.supportedOS) ?? {};
  const entries = Object.values(supported).map(asRecord).filter((entry): entry is JsonRecord => entry !== undefined);
  const platforms = Object.keys(supported)
    .flatMap((platform) => supportedApplePlatform(platform, supported[platform]))
    .sort();
  const manualInstallKnown = entries.some((entry) => typeof entry.allowmanualinstall === "boolean");
  return {
    platforms: [...new Set(platforms)],
    allowMultiple: entries.some((entry) => entry.multiple === true),
    requiresMdm: kind !== "profile" || (manualInstallKnown && entries.every((entry) => entry.allowmanualinstall === false)),
    deprecated,
    notes: appleSchemaAvailabilityNotes(entries),
  };
}

function supportedApplePlatform(platform: string, value: unknown): string[] {
  const mapped = relutionPlatform(platform);
  const detail = asRecord(value) ?? {};
  return mapped !== undefined && detail.introduced !== "n/a" ? [mapped] : [];
}

function appleSchemaAvailabilityNotes(entries: JsonRecord[]): string[] {
  return AVAILABILITY_NOTES
    .filter(([key]) => entries.some((entry) => entry[key] === true))
    .map(([, note]) => note)
    .sort();
}

function relutionPlatform(platform: string): string | undefined {
  return RELUTION_PLATFORMS[platform];
}

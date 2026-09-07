/** Selects Apple schema entries for editor and workspace consumers. */
import { appleProfileMetadata } from "./apple-profile.js";
import type { AppleSchemaCatalog, AppleSchemaEntry, AppleSchemaKind } from "./apple-schema-types.js";
import type { JsonRecord } from "../platform/serialization/json-guards.js";

export function appleSchemaEntriesForPlatform(
  catalog: AppleSchemaCatalog,
  platform: string,
  kind: AppleSchemaKind,
): AppleSchemaEntry[] {
  return catalog.entries
    .filter((entry) => entry.kind === kind && entry.identifier.length > 0 && entry.availability.platforms.includes(platform))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function findAppleSchemaEntry(catalog: AppleSchemaCatalog, id: string): AppleSchemaEntry | undefined {
  return catalog.entries.find((entry) => entry.id === id);
}

export function findAppleSchemaProfileForDetails(
  catalog: AppleSchemaCatalog,
  details: JsonRecord | undefined,
): AppleSchemaEntry | undefined {
  if (details?.type !== "APPLE_MOBILECONFIG") {
    return undefined;
  }
  const schemaId = appleSchemaMetadata(details)?.schemaId;
  if (typeof schemaId === "string") {
    const entry = findAppleSchemaEntry(catalog, schemaId);
    if (entry !== undefined) {
      return entry;
    }
  }
  const payloadType = details.secondLevelPayloadType;
  return typeof payloadType === "string"
    ? catalog.entries.find((entry) => entry.kind === "profile" && entry.identifier === payloadType)
    : undefined;
}

export function appleSchemaMetadata(details: JsonRecord | undefined): JsonRecord | undefined {
  return appleProfileMetadata(details);
}

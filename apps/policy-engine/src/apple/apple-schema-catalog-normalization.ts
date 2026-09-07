/** Turns Apple Device Management YAML documents into catalog entries. */
import { load as loadYaml } from "js-yaml";
import type { AppleSchemaEntry, AppleSchemaKind } from "./apple-schema-types.js";
import { appleSchemaAvailability } from "./apple-schema-catalog-availability.js";
import { normalizeAppleSchemaFields } from "./apple-schema-catalog-fields.js";
import { labelAppleSchemaIdentifier } from "./apple-schema-catalog-field-values.js";
import type { AppleSchemaDocument } from "./apple-schema-catalog-storage.js";
import { asRecord, stringValue, type JsonRecord } from "../platform/serialization/json-guards.js";

const APPLE_SCHEMA_IDENTIFIER_KEYS: Record<AppleSchemaKind, string[]> = {
  profile: ["payloadtype"],
  "mdm-command": ["requesttype", "checkintype"],
  "mdm-checkin": ["requesttype", "checkintype"],
  "ddm-status": ["statusitemtype"],
  "ddm-configuration": ["declarationtype", "assettype", "activationtype", "managementtype", "protocoltype"],
  "ddm-asset": ["declarationtype", "assettype", "activationtype", "managementtype", "protocoltype"],
  "ddm-activation": ["declarationtype", "assettype", "activationtype", "managementtype", "protocoltype"],
  "ddm-management": ["declarationtype", "assettype", "activationtype", "managementtype", "protocoltype"],
  "ddm-protocol": ["declarationtype", "assettype", "activationtype", "managementtype", "protocoltype"],
};

export function normalizeAppleSchemaDocument(document: AppleSchemaDocument): AppleSchemaEntry | undefined {
  const parsed = asRecord(loadYaml(document.content) as unknown);
  if (parsed === undefined || shouldSkipAppleSchemaDocument(document.path, parsed)) return undefined;
  const payload = asRecord(parsed.payload) ?? {};
  const identifier = appleSchemaIdentifier(document.kind, payload);
  if (identifier.length === 0 && document.path.includes("CommonPayloadKeys")) return undefined;
  const deprecated = /\/Deprecated\/|deprecated/u.test(document.path);
  return {
    id: "",
    kind: document.kind,
    title: stringValue(parsed.title) ?? appleSchemaTitleFromPath(document.path),
    description: stringValue(parsed.description) ?? "",
    identifier,
    sourcePath: document.path,
    availability: appleSchemaAvailability(document.kind, payload, deprecated),
    deprecated,
    fields: normalizeAppleSchemaFields(appleSchemaPayloadKeys(parsed)),
  };
}

function shouldSkipAppleSchemaDocument(sourcePath: string, _parsed: JsonRecord): boolean {
  return sourcePath.includes("TopLevel");
}

function appleSchemaIdentifier(kind: AppleSchemaKind, payload: JsonRecord): string {
  for (const key of APPLE_SCHEMA_IDENTIFIER_KEYS[kind]) {
    const value = stringValue(payload[key]);
    if (value !== undefined) return value;
  }
  return "";
}

function appleSchemaPayloadKeys(parsed: JsonRecord): unknown[] {
  return Array.isArray(parsed.payloadkeys) ? parsed.payloadkeys : [];
}

function appleSchemaTitleFromPath(path: string): string {
  return labelAppleSchemaIdentifier(path.split("/").at(-1)?.replace(/\.yaml$/u, "") ?? path);
}

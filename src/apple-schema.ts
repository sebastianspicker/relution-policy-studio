import { buildMobileConfig, plistValueFromUnknown, type PlistDataValue, type PlistValue } from "./plist.js";
import { PROFILE_EDITOR_META_KEY } from "./profile-editor-meta.js";

export type AppleSchemaKind =
  | "profile"
  | "ddm-configuration"
  | "ddm-asset"
  | "ddm-activation"
  | "ddm-management"
  | "ddm-status"
  | "mdm-command"
  | "mdm-checkin"
  | "ddm-protocol";

export type AppleSchemaFieldKind = "string" | "textarea" | "boolean" | "integer" | "number" | "list" | "json" | "data";

export interface AppleSchemaCatalog {
  version: 1;
  source: {
    repository: string;
    revision: string;
    generatedAt: string;
  };
  counts: Record<AppleSchemaKind, number>;
  entries: AppleSchemaEntry[];
}

export interface AppleSchemaEntry {
  id: string;
  kind: AppleSchemaKind;
  title: string;
  description: string;
  identifier: string;
  sourcePath: string;
  availability: AppleAvailability;
  deprecated: boolean;
  fields: AppleSchemaField[];
}

export interface AppleAvailability {
  platforms: string[];
  allowMultiple: boolean;
  requiresMdm: boolean;
  deprecated: boolean;
  notes: string[];
}

export interface AppleSchemaField {
  path: string;
  payloadKey: string;
  title: string;
  kind: AppleSchemaFieldKind;
  required: boolean;
  description: string;
  defaultValue: unknown;
  enumValues: string[];
  variableSafe: boolean;
}

export interface AppleSchemaValues {
  [key: string]: unknown;
}

export interface DdmArtifact {
  uuid: string;
  schemaId: string;
  kind: AppleSchemaKind;
  identifier: string;
  title: string;
  values: AppleSchemaValues;
  payload: Record<string, unknown>;
}

export interface MdmCommandArtifact {
  uuid: string;
  schemaId: string;
  requestType: string;
  title: string;
  values: AppleSchemaValues;
  payload: Record<string, unknown>;
}

export interface CustomSettingsInput {
  domain: string;
  settings: Record<string, unknown>;
  displayName?: string;
}

type JsonRecord = Record<string, unknown>;

const PROFILE_IDENTIFIER_PREFIX = "io.relution-policy-workbench.apple-schema";
const CUSTOM_SETTINGS_ID = "jamf-application-custom-settings";
const CUSTOM_SETTINGS_PROFILE_ENTRY: Omit<AppleSchemaEntry, "title" | "fields"> = {
  id: CUSTOM_SETTINGS_ID,
  kind: "profile",
  description: "Jamf-style custom managed preferences payload.",
  identifier: "com.apple.ManagedClient.preferences",
  sourcePath: "local/custom-settings",
  availability: {
    platforms: ["MACOS"],
    allowMultiple: true,
    requiresMdm: false,
    deprecated: false,
    notes: [],
  },
  deprecated: false,
};
const PAYLOAD_SHELL_KEYS = new Set(["PayloadDisplayName", "PayloadIdentifier", "PayloadType", "PayloadUUID", "PayloadVersion"]);

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
  const meta = appleSchemaMetadata(details);
  if (typeof meta?.schemaId === "string") {
    const entry = findAppleSchemaEntry(catalog, meta.schemaId);
    if (entry !== undefined) {
      return entry;
    }
  }
  if (typeof details.secondLevelPayloadType === "string") {
    return catalog.entries.find((entry) => entry.kind === "profile" && entry.identifier === details.secondLevelPayloadType);
  }
  return undefined;
}

export function isCustomSettingsDetails(details: JsonRecord | undefined): boolean {
  return appleSchemaMetadata(details)?.schemaId === CUSTOM_SETTINGS_ID;
}

export function createAppleSchemaProfileConfiguration(entry: AppleSchemaEntry, values: AppleSchemaValues = {}): JsonRecord {
  const now = Date.now();
  return {
    uuid: newUuid(),
    createdBy: "local",
    creationDate: now,
    modifiedBy: "local",
    modificationDate: now,
    details: createAppleSchemaProfileDetails(entry, values),
  };
}

export function updateAppleSchemaProfileDetails(
  details: JsonRecord,
  entry: AppleSchemaEntry,
  values: AppleSchemaValues,
): JsonRecord {
  return createAppleSchemaProfileDetails(entry, values, details);
}

export function extractAppleSchemaPayloadBodyJson(details: JsonRecord | undefined, entry: AppleSchemaEntry): string {
  return JSON.stringify(extractAppleSchemaPayloadBody(details, entry), null, 2);
}

export function updateAppleSchemaProfileDetailsFromPayloadBodyJson(
  details: JsonRecord,
  entry: AppleSchemaEntry,
  payloadBodyJson: string,
): JsonRecord {
  const payloadBody = parsePayloadBodyJson(payloadBodyJson);
  const values = valuesFromPayloadBody(entry, payloadBody);
  const payloadOverrides = unknownPayloadOverrides(payloadBody, knownPayloadKeysForEntry(entry));
  return createAppleSchemaProfileDetails(entry, values, details, payloadOverrides);
}

export function extractAppleSchemaValues(details: JsonRecord | undefined, entry: AppleSchemaEntry): AppleSchemaValues {
  const meta = appleSchemaMetadata(details);
  const stored = isRecord(meta?.values) ? meta.values : {};
  const values: AppleSchemaValues = {};
  for (const field of entry.fields) {
    if (hasOwn(stored, field.path)) {
      values[field.path] = stored[field.path];
      continue;
    }
    if (field.required) {
      values[field.path] = field.defaultValue;
    }
  }
  return values;
}

export function createCustomSettingsConfiguration(input: CustomSettingsInput): JsonRecord {
  const entry: AppleSchemaEntry = {
    ...CUSTOM_SETTINGS_PROFILE_ENTRY,
    title: input.displayName ?? "Application & Custom Settings",
    fields: [
      field("domain", "PayloadContent", "Preference domain", "string", true, "Preference domain.", input.domain),
      field("settingsJson", "PayloadContent", "Managed settings JSON", "json", true, "Managed preference key/value JSON.", input.settings),
    ],
  };
  const values = {
    domain: input.domain,
    settingsJson: JSON.stringify(input.settings, null, 2),
  };
  return createAppleSchemaProfileConfiguration(entry, values);
}

export function createDdmArtifact(entry: AppleSchemaEntry, values: AppleSchemaValues = {}): DdmArtifact {
  const normalized = normalizeValues(entry, values);
  return {
    uuid: newUuid(),
    schemaId: entry.id,
    kind: entry.kind,
    identifier: entry.identifier,
    title: entry.title,
    values: normalized,
    payload: payloadFromValues(entry, normalized),
  };
}

export function createMdmCommandArtifact(entry: AppleSchemaEntry, values: AppleSchemaValues = {}): MdmCommandArtifact {
  const normalized = normalizeValues(entry, values);
  return {
    uuid: newUuid(),
    schemaId: entry.id,
    requestType: entry.identifier,
    title: entry.title,
    values: normalized,
    payload: {
      RequestType: entry.identifier,
      ...payloadFromValues(entry, normalized),
    },
  };
}

export function appleSchemaWarnings(entry: AppleSchemaEntry, platform: string): string[] {
  const warnings: string[] = [];
  if (!entry.availability.platforms.includes(platform)) {
    warnings.push(`${entry.title} is not available for ${platform}.`);
  }
  if (entry.availability.deprecated || entry.deprecated) {
    warnings.push(`${entry.title} is deprecated in the Apple schema snapshot.`);
  }
  if (entry.availability.requiresMdm) {
    warnings.push(`${entry.title} requires MDM installation.`);
  }
  warnings.push(...entry.availability.notes);
  return warnings;
}

function createAppleSchemaProfileDetails(
  entry: AppleSchemaEntry,
  values: AppleSchemaValues,
  previousDetails?: JsonRecord,
  nextPayloadOverrides?: JsonRecord,
): JsonRecord {
  const previousMeta = appleSchemaMetadata(previousDetails);
  const detailUuid = stringValue(previousDetails?.uuid) ?? newUuid();
  const enabled = typeof previousDetails?.enabled === "boolean" ? previousDetails.enabled : true;
  const normalizedValues = normalizeValues(entry, values);
  const payloadOverrides = nextPayloadOverrides ?? (isRecord(previousMeta?.payloadOverrides) ? previousMeta.payloadOverrides : {});
  const profileUuid = stringValue(previousMeta?.profileUuid) ?? newUuid();
  const payloadUuid = stringValue(previousMeta?.payloadUuid) ?? newUuid();
  const payloadIdentifier = `${PROFILE_IDENTIFIER_PREFIX}.payload.${entry.id}.${payloadUuid.toLowerCase()}`;
  const profileIdentifier = `${PROFILE_IDENTIFIER_PREFIX}.profile.${entry.id}.${profileUuid.toLowerCase()}`;
  const payload = createPayload(entry, normalizedValues, payloadUuid, payloadIdentifier, payloadOverrides);
  const profile = {
    PayloadContent: [payload],
    PayloadDisplayName: entry.title,
    PayloadIdentifier: profileIdentifier,
    PayloadRemovalDisallowed: false,
    PayloadType: "Configuration",
    PayloadUUID: profileUuid,
    PayloadVersion: 1,
  } satisfies Record<string, PlistValue>;

  return {
    uuid: detailUuid,
    enabled,
    type: "APPLE_MOBILECONFIG",
    displayName: entry.title,
    rawContent: buildMobileConfig(profile),
    payloadContent: {
      [PROFILE_EDITOR_META_KEY]: {
        schemaId: entry.id,
        schemaKind: entry.kind,
        sourcePath: entry.sourcePath,
        values: normalizedValues,
        payloadOverrides,
        profileUuid,
        payloadUuid,
      },
      payload,
    },
    firstLevelPayloadType: "CONFIGURATION",
    secondLevelPayloadType: entry.identifier,
    mobileConfigSignatureState: "unsigned",
  };
}

function createPayload(
  entry: AppleSchemaEntry,
  values: AppleSchemaValues,
  payloadUuid: string,
  payloadIdentifier: string,
  payloadOverrides: JsonRecord = {},
): Record<string, PlistValue> {
  return {
    PayloadDisplayName: entry.title,
    PayloadIdentifier: payloadIdentifier,
    PayloadType: entry.identifier,
    PayloadUUID: payloadUuid,
    PayloadVersion: 1,
    ...plistValueFromUnknown(payloadOverrides) as Record<string, PlistValue>,
    ...plistValueFromUnknown(payloadFromValues(entry, values)) as Record<string, PlistValue>,
  };
}

function payloadFromValues(entry: AppleSchemaEntry, values: AppleSchemaValues): Record<string, unknown> {
  if (entry.id === CUSTOM_SETTINGS_ID) {
    const domain = stringValue(values.domain) ?? "com.example.app";
    const settings = parseJsonRecord(values.settingsJson);
    return {
      PayloadContent: {
        [domain]: {
          Forced: [
            {
              mcx_preference_settings: settings,
            },
          ],
        },
      },
    };
  }
  const payload: Record<string, unknown> = {};
  for (const fieldEntry of entry.fields) {
    const value = values[fieldEntry.path];
    if (entry.kind === "profile" && !fieldEntry.required && isEmptyOptionalValue(fieldEntry, value)) {
      continue;
    }
    payload[fieldEntry.payloadKey] = payloadValue(fieldEntry, value);
  }
  return payload;
}

function normalizeValues(entry: AppleSchemaEntry, values: AppleSchemaValues): AppleSchemaValues {
  const normalized: AppleSchemaValues = {};
  const providedValues = values as JsonRecord;
  for (const fieldEntry of entry.fields) {
    const provided = hasOwn(providedValues, fieldEntry.path);
    if (!fieldEntry.required && (!provided || providedValues[fieldEntry.path] === undefined)) {
      continue;
    }
    normalized[fieldEntry.path] = normalizeValue(fieldEntry, provided ? providedValues[fieldEntry.path] : fieldEntry.defaultValue);
  }
  return normalized;
}

function normalizeValue(fieldEntry: AppleSchemaField, value: unknown): unknown {
  if (fieldEntry.kind === "boolean") {
    return value === true;
  }
  if (fieldEntry.kind === "integer") {
    const parsed = parseIntegerValue(value);
    return parsed ?? 0;
  }
  if (fieldEntry.kind === "number") {
    const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (fieldEntry.kind === "list") {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
    return String(value ?? "")
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (fieldEntry.kind === "json") {
    return typeof value === "string" ? value : JSON.stringify(value ?? fieldEntry.defaultValue, null, 2);
  }
  if (fieldEntry.kind === "data") {
    return typeof value === "string" ? value : String(value ?? "");
  }
  return typeof value === "string" ? value : String(value ?? "");
}

function parseIntegerValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  const rawValue = String(value ?? "0").trim();
  if (!/^-?\d+$/u.test(rawValue)) {
    return undefined;
  }
  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function payloadValue(fieldEntry: AppleSchemaField, value: unknown): unknown {
  if (fieldEntry.kind === "json") {
    const text = typeof value === "string" ? value : JSON.stringify(value ?? fieldEntry.defaultValue);
    return JSON.parse(text.length === 0 ? "null" : text) as unknown;
  }
  if (fieldEntry.kind === "data") {
    return {
      kind: "data",
      base64: typeof value === "string" ? value : String(value ?? ""),
    } satisfies PlistDataValue;
  }
  return normalizeValue(fieldEntry, value);
}

function extractAppleSchemaPayloadBody(details: JsonRecord | undefined, entry: AppleSchemaEntry): JsonRecord {
  const payloadContent = isRecord(details?.payloadContent) ? details.payloadContent : undefined;
  const payload = isRecord(payloadContent?.payload) ? payloadContent.payload : undefined;
  if (payload !== undefined) {
    return payloadBodyToJsonRecord(omitPayloadShell(payload));
  }
  const values = extractAppleSchemaValues(details, entry);
  return payloadBodyToJsonRecord(payloadFromValues(entry, normalizeValues(entry, values)));
}

function valuesFromPayloadBody(entry: AppleSchemaEntry, payloadBody: JsonRecord): AppleSchemaValues {
  if (entry.id === CUSTOM_SETTINGS_ID) {
    return customSettingsValuesFromPayloadBody(payloadBody);
  }
  const values: AppleSchemaValues = {};
  for (const fieldEntry of entry.fields) {
    if (hasOwn(payloadBody, fieldEntry.payloadKey)) {
      values[fieldEntry.path] = fieldValueFromPayload(fieldEntry, payloadBody[fieldEntry.payloadKey]);
      continue;
    }
    if (fieldEntry.required) {
      values[fieldEntry.path] = fieldEntry.defaultValue;
    }
  }
  return values;
}

function customSettingsValuesFromPayloadBody(payloadBody: JsonRecord): AppleSchemaValues {
  const payloadContent = isRecord(payloadBody.PayloadContent) ? payloadBody.PayloadContent : {};
  const [domain, domainPayload] = Object.entries(payloadContent)[0] ?? ["com.example.app", undefined];
  const forced = isRecord(domainPayload) && Array.isArray(domainPayload.Forced) ? domainPayload.Forced : [];
  const firstForced = isRecord(forced[0]) ? forced[0] : {};
  const settings = isRecord(firstForced.mcx_preference_settings) ? firstForced.mcx_preference_settings : {};
  return {
    domain,
    settingsJson: JSON.stringify(settings, null, 2),
  };
}

function fieldValueFromPayload(fieldEntry: AppleSchemaField, value: unknown): unknown {
  if (fieldEntry.kind === "boolean") {
    return typeof value === "boolean" ? value : fieldEntry.defaultValue;
  }
  if (fieldEntry.kind === "integer") {
    return typeof value === "number" && Number.isInteger(value) ? value : fieldEntry.defaultValue;
  }
  if (fieldEntry.kind === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : fieldEntry.defaultValue;
  }
  if (fieldEntry.kind === "list") {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : fieldEntry.defaultValue;
  }
  if (fieldEntry.kind === "json") {
    return JSON.stringify(value ?? fieldEntry.defaultValue, null, 2);
  }
  if (fieldEntry.kind === "data") {
    return typeof value === "string" ? value : isPlistDataValue(value) ? value.base64 : String(value ?? "");
  }
  return typeof value === "string" ? value : String(value ?? "");
}

function knownPayloadKeysForEntry(entry: AppleSchemaEntry): Set<string> {
  return new Set(entry.fields.map((fieldEntry) => fieldEntry.payloadKey));
}

function isEmptyOptionalValue(fieldEntry: AppleSchemaField, value: unknown): boolean {
  if (fieldEntry.kind === "boolean") {
    return value === undefined || value === null || value === "";
  }
  if (fieldEntry.kind === "integer" || fieldEntry.kind === "number") {
    return value === undefined || value === null || value === "";
  }
  if (fieldEntry.kind === "list") {
    return Array.isArray(value) ? value.length === 0 : String(value ?? "").trim().length === 0;
  }
  if (fieldEntry.kind === "json") {
    const parsed = parseJsonValue(value);
    return Array.isArray(parsed) ? parsed.length === 0 : isRecord(parsed) ? Object.keys(parsed).length === 0 : parsed === null;
  }
  return String(value ?? "").length === 0;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  return isRecord(parsed) ? parsed : {};
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return JSON.parse(value.length === 0 ? "null" : value) as unknown;
}

function payloadBodyToJsonRecord(value: unknown): JsonRecord {
  const normalized = jsonValueFromPayload(value);
  return isRecord(normalized) ? normalized : {};
}

function jsonValueFromPayload(value: unknown): unknown {
  if (isPlistDataValue(value)) {
    return value.base64;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => jsonValueFromPayload(entry));
  }
  if (isRecord(value)) {
    const output: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = jsonValueFromPayload(entry);
    }
    return output;
  }
  return value;
}

function parsePayloadBodyJson(value: string): JsonRecord {
  const parsed = JSON.parse(value.length === 0 ? "{}" : value) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Payload JSON must be an object");
  }
  return omitPayloadShell(parsed);
}

function omitPayloadShell(record: JsonRecord): JsonRecord {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (!PAYLOAD_SHELL_KEYS.has(key)) {
      output[key] = value;
    }
  }
  return output;
}

function unknownPayloadOverrides(record: JsonRecord, knownKeys: Set<string>): JsonRecord {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (!knownKeys.has(key)) {
      output[key] = value;
    }
  }
  return output;
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function appleSchemaMetadata(details: JsonRecord | undefined): JsonRecord | undefined {
  const payloadContent = details?.payloadContent;
  if (!isRecord(payloadContent)) {
    return undefined;
  }
  const meta = payloadContent[PROFILE_EDITOR_META_KEY];
  return isRecord(meta) ? meta : undefined;
}

function isPlistDataValue(value: unknown): value is PlistDataValue {
  return isRecord(value) && value.kind === "data" && typeof value.base64 === "string";
}

function field(
  path: string,
  payloadKey: string,
  title: string,
  kind: AppleSchemaFieldKind,
  required: boolean,
  description: string,
  defaultValue: unknown,
): AppleSchemaField {
  return {
    path,
    payloadKey,
    title,
    kind,
    required,
    description,
    defaultValue,
    enumValues: [],
    variableSafe: kind === "string" || kind === "textarea",
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().toUpperCase();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/gu, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  }).toUpperCase();
}

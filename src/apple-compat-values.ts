import type { AppleCompatField, AppleCompatObjectField, AppleCompatSetting, JsonRecord } from "./apple-compat-types.js";
import { PROFILE_EDITOR_META_KEY, PROFILE_IDENTIFIER_PREFIX } from "./apple-compat-types.js";
import { APPLE_COMPAT_SETTINGS } from "./apple-compat-settings.js";
import { buildMobileConfig, jsonPayloadKeys, plistValueFromUnknown, type PlistValue } from "./plist.js";

const PAYLOAD_SHELL_KEYS = new Set(["PayloadDisplayName", "PayloadIdentifier", "PayloadType", "PayloadUUID", "PayloadVersion"]);

export function appleCompatSettingsForPlatform(platform: string): AppleCompatSetting[] {
  return APPLE_COMPAT_SETTINGS.filter(
    (setting) => setting.status === "mobileconfig-backed" && setting.platforms.includes(platform),
  );
}

export function findAppleCompatSetting(id: string): AppleCompatSetting | undefined {
  return APPLE_COMPAT_SETTINGS.find((setting) => setting.id === id);
}

export function findAppleCompatSettingForDetails(details: JsonRecord | undefined): AppleCompatSetting | undefined {
  if (details?.type !== "APPLE_MOBILECONFIG" || typeof details.secondLevelPayloadType !== "string") {
    return undefined;
  }
  const meta = appleCompatMetadata(details);
  if (typeof meta?.settingId === "string") {
    return findAppleCompatSetting(meta.settingId);
  }
  return APPLE_COMPAT_SETTINGS.find(
    (setting) => setting.status === "mobileconfig-backed" && setting.payloadType === details.secondLevelPayloadType,
  );
}

export function createAppleCompatConfiguration(settingId: string, values: JsonRecord = {}): JsonRecord {
  const setting = requireAppleCompatSetting(settingId);
  const now = Date.now();
  return {
    uuid: newUuid(),
    createdBy: "local",
    creationDate: now,
    modifiedBy: "local",
    modificationDate: now,
    details: createAppleCompatDetails(setting, values),
  };
}

export function updateAppleCompatDetails(details: JsonRecord, settingId: string, values: JsonRecord): JsonRecord {
  const setting = requireAppleCompatSetting(settingId);
  return createAppleCompatDetails(setting, values, details);
}

export function extractAppleCompatPayloadBodyJson(details: JsonRecord | undefined, setting: AppleCompatSetting): string {
  return JSON.stringify(extractAppleCompatPayloadBody(details, setting), null, 2);
}

export function updateAppleCompatDetailsFromPayloadBodyJson(
  details: JsonRecord,
  settingId: string,
  payloadBodyJson: string,
): JsonRecord {
  const setting = requireAppleCompatSetting(settingId);
  const payloadBody = parsePayloadBodyJson(payloadBodyJson, `setting ${settingId} payload body`);
  if (setting.builder === "generic-json") {
    return createAppleCompatDetails(setting, { payloadKeysJson: JSON.stringify(payloadBody, null, 2) }, details, {});
  }
  const nextValues = valuesFromPayloadBody(setting, payloadBody);
  const knownKeys = knownPayloadKeysForSetting(setting);
  const payloadOverrides = unknownPayloadOverrides(payloadBody, knownKeys);
  return createAppleCompatDetails(setting, nextValues, details, payloadOverrides);
}

export function extractAppleCompatValues(details: JsonRecord | undefined, setting: AppleCompatSetting): JsonRecord {
  const meta = appleCompatMetadata(details);
  const stored = asRecord(meta?.values);
  const values: JsonRecord = {};
  for (const fieldEntry of setting.fields) {
    values[fieldEntry.id] = stored?.[fieldEntry.id] ?? fieldEntry.defaultValue;
  }
  if (setting.builder === "generic-json") {
    const payloadKeys = tryParsePayloadKeysJson(values.payloadKeysJson);
    if (payloadKeys !== undefined) {
      return hydrateGuidedValuesFromPayloadKeys(setting, values, payloadKeys);
    }
  }
  return values;
}

function createAppleCompatDetails(
  setting: AppleCompatSetting,
  values: JsonRecord,
  previousDetails?: JsonRecord,
  nextPayloadOverrides?: JsonRecord,
): JsonRecord {
  const previousMeta = appleCompatMetadata(previousDetails);
  const detailUuid = stringValue(previousDetails?.uuid) ?? newUuid();
  const enabled = typeof previousDetails?.enabled === "boolean" ? previousDetails.enabled : true;
  const normalizedValues = normalizeValues(setting, values, previousDetails);
  const payloadOverrides = nextPayloadOverrides ?? asRecord(previousMeta?.payloadOverrides) ?? {};
  const profileUuid = stringValue(previousMeta?.profileUuid) ?? newUuid();
  const payloadUuid = stringValue(previousMeta?.payloadUuid) ?? newUuid();
  const payloadIdentifier = `${PROFILE_IDENTIFIER_PREFIX}.payload.${setting.id}.${payloadUuid.toLowerCase()}`;
  const profileIdentifier = `${PROFILE_IDENTIFIER_PREFIX}.profile.${setting.id}.${profileUuid.toLowerCase()}`;
  const payload = createPayload(setting, normalizedValues, { payloadUuid, payloadIdentifier }, payloadOverrides);
  const profile = {
    PayloadContent: [payload],
    PayloadDisplayName: setting.label,
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
    displayName: setting.label,
    rawContent: buildMobileConfig(profile),
    payloadContent: {
      [PROFILE_EDITOR_META_KEY]: {
        settingId: setting.id,
        values: normalizedValues,
        payloadOverrides,
        profileUuid,
        payloadUuid,
      },
      payload,
    },
    firstLevelPayloadType: "CONFIGURATION",
    secondLevelPayloadType: setting.payloadType,
  };
}

function createPayload(
  setting: AppleCompatSetting,
  values: JsonRecord,
  identifiers: { payloadUuid: string; payloadIdentifier: string },
  payloadOverrides: JsonRecord = {},
): Record<string, PlistValue> {
  const common: Record<string, PlistValue> = {
    PayloadDisplayName: setting.label,
    PayloadIdentifier: identifiers.payloadIdentifier,
    PayloadType: setting.payloadType,
    PayloadUUID: identifiers.payloadUuid,
    PayloadVersion: 1,
  };
  const overridden = { ...common, ...jsonPayloadKeys(payloadOverrides) };

  switch (setting.builder) {
    case "pppc":
      return {
        ...overridden,
        Services: {
          [stringValue(values.service) ?? "Accessibility"]: [
            {
              Authorization: stringValue(values.authorization) ?? "Allow",
              CodeRequirement: stringValue(values.codeRequirement) ?? "",
              Identifier: stringValue(values.identifier) ?? "",
              IdentifierType: stringValue(values.identifierType) ?? "bundleID",
            },
          ],
        },
      };
    case "managed-preferences":
      return {
        ...overridden,
        PayloadContent: {
          [stringValue(values.domain) ?? "com.example.app"]: {
            Forced: [
              {
                mcx_preference_settings: {
                  [stringValue(values.key) ?? "ExampleKey"]: plistValueFromUnknown(values.value ?? ""),
                },
              },
            ],
          },
        },
      };
    case "associated-domains":
      return {
        ...overridden,
        ApplicationIdentifier: stringValue(values.applicationIdentifier) ?? "",
        AssociatedDomains: listValue(values.associatedDomains),
      };
    case "managed-login-items":
      return {
        ...overridden,
        Rules: [
          {
            Comment: stringValue(values.comment) ?? "",
            RuleType: "BundleIdentifier",
            RuleValue: stringValue(values.bundleIdentifier) ?? "",
            TeamIdentifier: stringValue(values.teamIdentifier) ?? "",
          },
        ],
      };
    case "generic-json":
      return { ...common, ...jsonPayloadKeys(parsePayloadKeysJson(values.payloadKeysJson, `setting ${setting.id} payload keys`)) };
  }
}

function extractAppleCompatPayloadBody(details: JsonRecord | undefined, setting: AppleCompatSetting): JsonRecord {
  const payload = asRecord(asRecord(details?.payloadContent)?.payload);
  if (payload !== undefined) {
    return omitPayloadShell(payload);
  }
  const values = extractAppleCompatValues(details, setting);
  return omitPayloadShell(createPayload(setting, values, { payloadUuid: "", payloadIdentifier: "" }));
}

function valuesFromPayloadBody(setting: AppleCompatSetting, payloadBody: JsonRecord): JsonRecord {
  const values = extractAppleCompatValues(undefined, setting);
  switch (setting.builder) {
    case "pppc": {
      const services = asRecord(payloadBody.Services);
      const [service, serviceRules] = firstEntry(services);
      const firstRule = Array.isArray(serviceRules) ? asRecord(serviceRules[0]) : undefined;
      return {
        ...values,
        service: service ?? values.service,
        authorization: stringValue(firstRule?.Authorization) ?? values.authorization,
        codeRequirement: stringValue(firstRule?.CodeRequirement) ?? values.codeRequirement,
        identifier: stringValue(firstRule?.Identifier) ?? values.identifier,
        identifierType: stringValue(firstRule?.IdentifierType) ?? values.identifierType,
      };
    }
    case "managed-preferences": {
      const payloadContent = asRecord(payloadBody.PayloadContent);
      const [domain, domainPayload] = firstEntry(payloadContent);
      const forced = asRecord(domainPayload)?.Forced;
      const firstForced = Array.isArray(forced) ? asRecord(forced[0]) : undefined;
      const settings = asRecord(firstForced?.mcx_preference_settings);
      const [key, value] = firstEntry(settings);
      return {
        ...values,
        domain: domain ?? values.domain,
        key: key ?? values.key,
        value: value === undefined ? values.value : JSON.stringify(value, null, 2),
      };
    }
    case "associated-domains":
      return {
        ...values,
        applicationIdentifier: stringValue(payloadBody.ApplicationIdentifier) ?? values.applicationIdentifier,
        associatedDomains: Array.isArray(payloadBody.AssociatedDomains)
          ? payloadBody.AssociatedDomains.filter((entry): entry is string => typeof entry === "string")
          : values.associatedDomains,
      };
    case "managed-login-items": {
      const rules = Array.isArray(payloadBody.Rules) ? payloadBody.Rules : [];
      const firstRule = asRecord(rules[0]);
      return {
        ...values,
        comment: stringValue(firstRule?.Comment) ?? values.comment,
        bundleIdentifier: stringValue(firstRule?.RuleValue) ?? values.bundleIdentifier,
        teamIdentifier: stringValue(firstRule?.TeamIdentifier) ?? values.teamIdentifier,
      };
    }
    case "generic-json":
      return { ...values, payloadKeysJson: JSON.stringify(payloadBody, null, 2) };
  }
}

function firstEntry(record: JsonRecord | undefined): readonly [string | undefined, unknown] {
  return record === undefined ? [undefined, undefined] : Object.entries(record)[0] ?? [undefined, undefined];
}

function knownPayloadKeysForSetting(setting: AppleCompatSetting): Set<string> {
  switch (setting.builder) {
    case "pppc":
      return new Set(["Services"]);
    case "managed-preferences":
      return new Set(["PayloadContent"]);
    case "associated-domains":
      return new Set(["ApplicationIdentifier", "AssociatedDomains"]);
    case "managed-login-items":
      return new Set(["Rules"]);
    case "generic-json":
      return new Set(Object.keys(parsePayloadKeysJson(extractAppleCompatValues(undefined, setting).payloadKeysJson)));
  }
}

function normalizeValues(setting: AppleCompatSetting, values: JsonRecord, previousDetails?: JsonRecord): JsonRecord {
  const normalized: JsonRecord = {};
  for (const fieldEntry of setting.fields) {
    const value = values[fieldEntry.id] ?? fieldEntry.defaultValue;
    normalized[fieldEntry.id] = normalizeFieldValue(fieldEntry, value);
  }
  if (setting.builder === "generic-json") {
    return syncPayloadKeysJsonValues(setting, normalized, values, previousDetails);
  }
  return normalized;
}

function normalizeFieldValue(fieldEntry: AppleCompatField | AppleCompatObjectField, value: unknown): unknown {
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
    return listValue(value);
  }
  if (fieldEntry.kind === "key-value-list") {
    return keyValueRecord(value);
  }
  if (fieldEntry.kind === "object-list") {
    return objectListValue(fieldEntry, value);
  }
  if (fieldEntry.kind === "json") {
    return typeof value === "string" ? value : JSON.stringify(value ?? fieldEntry.defaultValue, null, 2);
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

function syncPayloadKeysJsonValues(
  setting: AppleCompatSetting,
  normalized: JsonRecord,
  submittedValues: JsonRecord,
  previousDetails?: JsonRecord,
): JsonRecord {
  const payloadKeys = parsePayloadKeysJson(normalized.payloadKeysJson, `setting ${setting.id} payload keys`);
  const previousValues = asRecord(appleCompatMetadata(previousDetails)?.values);
  const previousJson = typeof previousValues?.payloadKeysJson === "string" ? previousValues.payloadKeysJson : undefined;
  const submittedJson = typeof submittedValues.payloadKeysJson === "string" ? submittedValues.payloadKeysJson : undefined;
  const payloadJsonChanged = previousJson !== undefined && submittedJson !== undefined && submittedJson !== previousJson;
  const guidedValueSubmitted = setting.fields.some((fieldEntry) => fieldEntry.id !== "payloadKeysJson" && hasOwn(submittedValues, fieldEntry.id));
  const jsonIsCanonical = payloadJsonChanged || (previousJson === undefined && !guidedValueSubmitted);

  if (jsonIsCanonical) {
    return hydrateGuidedValuesFromPayloadKeys(setting, normalized, payloadKeys);
  }

  const mergedPayloadKeys = mergeGuidedValuesIntoPayloadKeys(setting, normalized, payloadKeys);
  normalized.payloadKeysJson = JSON.stringify(mergedPayloadKeys, null, 2);
  return hydrateGuidedValuesFromPayloadKeys(setting, normalized, mergedPayloadKeys);
}

function mergeGuidedValuesIntoPayloadKeys(setting: AppleCompatSetting, values: JsonRecord, payloadKeys: JsonRecord): JsonRecord {
  if (setting.id === "system-migration") {
    return mergeSystemMigrationValuesIntoPayloadKeys(values, payloadKeys);
  }
  const output: JsonRecord = { ...payloadKeys };
  for (const fieldEntry of setting.fields) {
    if (fieldEntry.id === "payloadKeysJson" || fieldEntry.payloadKey === undefined) {
      continue;
    }
    output[fieldEntry.payloadKey] = payloadValueFromField(fieldEntry, values[fieldEntry.id]);
  }
  return output;
}

function hydrateGuidedValuesFromPayloadKeys(setting: AppleCompatSetting, values: JsonRecord, payloadKeys: JsonRecord): JsonRecord {
  const hydrated: JsonRecord = { ...values, payloadKeysJson: JSON.stringify(payloadKeys, null, 2) };
  if (setting.id === "system-migration") {
    hydrateSystemMigrationValues(hydrated, payloadKeys);
    return hydrated;
  }
  for (const fieldEntry of setting.fields) {
    if (fieldEntry.id === "payloadKeysJson" || fieldEntry.payloadKey === undefined || !hasOwn(payloadKeys, fieldEntry.payloadKey)) {
      continue;
    }
    hydrated[fieldEntry.id] = fieldValueFromPayload(fieldEntry, payloadKeys[fieldEntry.payloadKey]);
  }
  return hydrated;
}

function mergeSystemMigrationValuesIntoPayloadKeys(values: JsonRecord, payloadKeys: JsonRecord): JsonRecord {
  return {
    ...payloadKeys,
    CustomBehavior: [
      {
        Context: stringValue(values.migrationContext) ?? "Windows",
        Paths: [
          {
            SourcePath: stringValue(values.sourcePath) ?? "",
            SourcePathInUserHome: values.sourcePathInUserHome === true,
            TargetPath: stringValue(values.targetPath) ?? "",
            TargetPathInUserHome: values.targetPathInUserHome === true,
          },
        ],
      },
    ],
  };
}

function hydrateSystemMigrationValues(values: JsonRecord, payloadKeys: JsonRecord): void {
  const customBehavior = Array.isArray(payloadKeys.CustomBehavior) ? payloadKeys.CustomBehavior : [];
  const firstBehavior = asRecord(customBehavior[0]);
  const paths = Array.isArray(firstBehavior?.Paths) ? firstBehavior.Paths : [];
  const firstPath = asRecord(paths[0]);
  values.migrationContext = stringValue(firstBehavior?.Context) ?? values.migrationContext ?? "Windows";
  values.sourcePath = stringValue(firstPath?.SourcePath) ?? values.sourcePath ?? "";
  values.sourcePathInUserHome =
    typeof firstPath?.SourcePathInUserHome === "boolean" ? firstPath.SourcePathInUserHome : values.sourcePathInUserHome === true;
  values.targetPath = stringValue(firstPath?.TargetPath) ?? values.targetPath ?? "";
  values.targetPathInUserHome =
    typeof firstPath?.TargetPathInUserHome === "boolean" ? firstPath.TargetPathInUserHome : values.targetPathInUserHome === true;
}

function payloadValueFromField(fieldEntry: AppleCompatField | AppleCompatObjectField, value: unknown): unknown {
  if (fieldEntry.kind === "json") {
    const text = typeof value === "string" ? value : JSON.stringify(value ?? fieldEntry.defaultValue);
    return JSON.parse(text.length === 0 ? "null" : text) as unknown;
  }
  if (fieldEntry.kind === "object-list") {
    return objectListPayloadValue(fieldEntry, value);
  }
  if (fieldEntry.kind === "key-value-list") {
    return keyValueRecord(value);
  }
  return normalizeFieldValue(fieldEntry, value);
}

function fieldValueFromPayload(fieldEntry: AppleCompatField | AppleCompatObjectField, value: unknown): unknown {
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
    return listValue(value);
  }
  if (fieldEntry.kind === "json") {
    return JSON.stringify(value ?? fieldEntry.defaultValue, null, 2);
  }
  if (fieldEntry.kind === "key-value-list") {
    return keyValueRecord(value);
  }
  if (fieldEntry.kind === "object-list") {
    return objectListFieldValueFromPayload(fieldEntry, value);
  }
  return typeof value === "string" ? value : String(value ?? "");
}

function objectListPayloadValue(fieldEntry: AppleCompatField, value: unknown): JsonRecord[] {
  const rows = objectListValue(fieldEntry, value);
  return rows.map((row) => {
    const output: JsonRecord = {};
    for (const itemField of fieldEntry.itemFields ?? []) {
      if (itemField.payloadKey !== undefined) {
        output[itemField.payloadKey] = payloadValueFromField(itemField, row[itemField.id]);
      }
    }
    return output;
  });
}

function objectListFieldValueFromPayload(fieldEntry: AppleCompatField, value: unknown): JsonRecord[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((entry) => {
    const input = asRecord(entry) ?? {};
    const output: JsonRecord = {};
    for (const itemField of fieldEntry.itemFields ?? []) {
      const payloadValue = itemField.payloadKey === undefined ? undefined : input[itemField.payloadKey];
      output[itemField.id] = payloadValue === undefined ? itemField.defaultValue : fieldValueFromPayload(itemField, payloadValue);
    }
    return output;
  });
}

function objectListValue(fieldEntry: AppleCompatField, value: unknown): JsonRecord[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((entry) => {
    const input = asRecord(entry) ?? {};
    const output: JsonRecord = {};
    for (const itemField of fieldEntry.itemFields ?? []) {
      output[itemField.id] = normalizeFieldValue(itemField, input[itemField.id] ?? itemField.defaultValue);
    }
    return output;
  });
}

function keyValueRecord(value: unknown): JsonRecord {
  const record = asRecord(value);
  if (record !== undefined) {
    const output: JsonRecord = {};
    for (const [key, entry] of Object.entries(record)) {
      if (key.trim().length > 0) {
        output[key] = typeof entry === "string" ? entry : String(entry ?? "");
      }
    }
    return output;
  }
  if (typeof value !== "string") {
    return {};
  }
  const output: JsonRecord = {};
  for (const line of value.split(/\r?\n/u)) {
    const separator = line.includes(":") ? ":" : "=";
    const [rawKey, ...rawValue] = line.split(separator);
    const key = rawKey?.trim() ?? "";
    if (key.length > 0) {
      // Values may themselves contain ":" or "="; only the first separator
      // splits the key from the value.
      output[key] = rawValue.join(separator).trim();
    }
  }
  return output;
}

function parsePayloadKeysJson(value: unknown, label = "payload keys"): JsonRecord {
  const text = typeof value === "string" ? value : "{}";
  const parsed = parseJsonWithContext(text, label);
  const record = asRecord(parsed);
  if (record === undefined) {
    throw new Error(`${label} JSON must be an object`);
  }
  return record;
}

function parsePayloadBodyJson(value: string, label = "payload body"): JsonRecord {
  const parsed = parseJsonWithContext(value.length === 0 ? "{}" : value, label);
  const record = asRecord(parsed);
  if (record === undefined) {
    throw new Error(`${label} JSON must be an object`);
  }
  return omitPayloadShell(record);
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

function tryParsePayloadKeysJson(value: unknown): JsonRecord | undefined {
  try {
    return parsePayloadKeysJson(value);
  } catch {
    return undefined;
  }
}

function parseJsonWithContext(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${label} JSON: ${message}`);
  }
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function appleCompatMetadata(details: JsonRecord | undefined): JsonRecord | undefined {
  const payloadContent = asRecord(details?.payloadContent);
  return asRecord(payloadContent?.[PROFILE_EDITOR_META_KEY]);
}

function requireAppleCompatSetting(settingId: string): AppleCompatSetting {
  const setting = findAppleCompatSetting(settingId);
  if (setting === undefined || setting.status !== "mobileconfig-backed") {
    throw new Error(`Unsupported Apple compatibility setting: ${settingId}`);
  }
  return setting;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function newUuid(): string {
  return globalThis.crypto.randomUUID().toUpperCase();
}

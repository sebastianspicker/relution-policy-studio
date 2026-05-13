import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface RelutionTemplateBundle {
  serverVersion: string;
  sourceImage: string;
  sourceImageDigest: string;
  generatedAt: string;
  refreshDiagnostics: TemplateRefreshDiagnostics;
  platforms: string[];
  enrollmentTypes: string[];
  configurationTypes: ConfigurationTemplate[];
  schemas: Record<string, JsonObject>;
  iosSystemApps: unknown;
  springConfigurationMetadata: unknown;
}

export interface TemplateRefreshDiagnostics {
  runtimeMetadata: {
    source: "reflected" | "heuristic";
    reflectedCount: number;
    configurationTypeCount: number;
  };
  iosSystemAppsLoaded: boolean;
  springConfigurationMetadataLoaded: boolean;
}

export interface ConfigurationTemplate {
  type: string;
  label: string;
  description?: string;
  descriptionSource?: TemplateDescriptionSource;
  schemaName: string;
  platforms: string[];
  enrollmentTypes: string[];
  multiConfig: boolean;
  portalHidden: boolean;
  placeholders: string[];
  required: string[];
  fields: TemplateField[];
}

export interface TemplateField {
  path: string;
  label: string;
  kind: string;
  required: boolean;
  nullable: boolean;
  enumValues: string[];
  enumLabels: Record<string, string>;
  description?: string;
  descriptionSource?: TemplateDescriptionSource;
  defaultValue?: unknown;
  itemKind?: string;
  itemFields?: TemplateField[];
  ref?: string;
}

export interface RuntimeConfigurationTypeMetadata {
  type: string;
  platforms: string[];
  enrollmentTypes: string[];
  multiConfig: boolean;
  placeholders: string[];
  portalHidden: boolean;
}

export type JsonObject = Record<string, unknown>;
export type TemplateDescriptionSource = "schema" | "openapi" | "generated";

export const DEFAULT_TEMPLATE_BUNDLE_PATH = "data/relution-26.1.1/template-bundle.json";
const BUNDLED_TEMPLATE_BUNDLE_PATH = fileURLToPath(new URL("../../data/relution-26.1.1/template-bundle.json", import.meta.url));

const PORTAL_HIDDEN_TYPES = new Set([
  "IOS_LDAP",
  "IOS_SINGLE_SIGN_ON",
  "ANDROID_BLUETOOTH",
  "IOS_EDUCATION",
  "MACOS_ACCOUNT_SETUP",
  "ANDROID_ENTERPRISE_DISABLE_CAMERAS",
  "ANDROID_ENTERPRISE_SYSTEM_CLOCK_MANAGEMENT",
  "ANDROID_ENTERPRISE_SYSTEM_AUDIO_MANAGEMENT",
  "ANDROID_ENTERPRISE_SYSTEM_RADIO_MANAGEMENT",
]);

const WORD_LABELS: Record<string, string> = {
  ACL: "ACL",
  AD: "AD",
  AES: "AES",
  AI: "AI",
  APN: "APN",
  APNS: "APNs",
  API: "API",
  ARD: "ARD",
  BYOD: "BYOD",
  CA: "CA",
  CALDAV: "CalDAV",
  CARDDAV: "CardDAV",
  CDN: "CDN",
  CERT: "Certificate",
  CHROMEOS: "ChromeOS",
  CRL: "CRL",
  CSV: "CSV",
  CSP: "CSP",
  CSR: "CSR",
  DAV: "DAV",
  DEP: "DEP",
  DHCP: "DHCP",
  DNS: "DNS",
  EAP: "EAP",
  FDE: "FDE",
  FIDO: "FIDO",
  FQDN: "FQDN",
  HTTP: "HTTP",
  HTTPS: "HTTPS",
  ICCID: "ICCID",
  ID: "ID",
  IFP: "IFP",
  IMEI: "IMEI",
  IMSI: "IMSI",
  IOS: "iOS",
  IOT: "IoT",
  IP: "IP",
  JSON: "JSON",
  JWT: "JWT",
  KNX: "KNX",
  LAN: "LAN",
  LDAP: "LDAP",
  MAC: "MAC",
  MACOS: "macOS",
  MDM: "MDM",
  MMS: "MMS",
  MSCA: "MSCA",
  NFC: "NFC",
  OAUTH: "OAuth",
  OIDC: "OIDC",
  OS: "OS",
  OTA: "OTA",
  PDF: "PDF",
  PEAP: "PEAP",
  PIN: "PIN",
  PKCS: "PKCS",
  PSK: "PSK",
  QR: "QR",
  RCS: "RCS",
  RDP: "RDP",
  SAML: "SAML",
  SCEP: "SCEP",
  SCIM: "SCIM",
  SID: "SID",
  SMB: "SMB",
  SMS: "SMS",
  SMTP: "SMTP",
  SSID: "SSID",
  SSL: "SSL",
  SSO: "SSO",
  TCP: "TCP",
  TKIP: "TKIP",
  TLS: "TLS",
  TPM: "TPM",
  TVOS: "tvOS",
  UDP: "UDP",
  UI: "UI",
  URI: "URI",
  URL: "URL",
  USB: "USB",
  UUID: "UUID",
  VPP: "VPP",
  VPN: "VPN",
  WAN: "WAN",
  WEP: "WEP",
  WIFI: "Wi-Fi",
  WPA: "WPA",
  XML: "XML",
};

export function loadTemplateBundle(bundlePath = DEFAULT_TEMPLATE_BUNDLE_PATH): RelutionTemplateBundle {
  const resolved = bundlePath === DEFAULT_TEMPLATE_BUNDLE_PATH ? BUNDLED_TEMPLATE_BUNDLE_PATH : resolve(bundlePath);
  if (!existsSync(resolved)) {
    throw new Error(`Template bundle not found: ${resolved}. Run rexp templates refresh first.`);
  }
  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  if (!isObject(parsed) || !Array.isArray(parsed.configurationTypes)) {
    throw new Error(`Invalid template bundle: ${resolved}`);
  }
  return withTemplateFieldMetadata(withRefreshDiagnostics(parsed as unknown as RelutionTemplateBundle));
}

export function findTemplate(bundle: RelutionTemplateBundle, type: string): ConfigurationTemplate | undefined {
  return bundle.configurationTypes.find((template) => template.type === type);
}

export function listTemplates(bundle: RelutionTemplateBundle, platform?: string): ConfigurationTemplate[] {
  if (platform === undefined) {
    return bundle.configurationTypes;
  }
  return bundle.configurationTypes.filter((template) => template.platforms.includes(platform));
}

export function createTemplateBundle(input: {
  openApi: JsonObject;
  iosSystemApps: unknown;
  runtimeMetadata: RuntimeConfigurationTypeMetadata[];
  serverVersion: string;
  sourceImage: string;
  sourceImageDigest: string;
  springConfigurationMetadata: unknown;
  generatedAt?: string;
  refreshDiagnostics?: TemplateRefreshDiagnostics;
}): RelutionTemplateBundle {
  const components = asObject(input.openApi.components, "openapi.components");
  const schemas = asObject(components.schemas, "openapi.components.schemas") as Record<string, JsonObject>;
  const configurationDetails = asObject(schemas.ConfigurationDetails, "ConfigurationDetails");
  const discriminator = asObject(configurationDetails.discriminator, "ConfigurationDetails.discriminator");
  const mapping = asObject(discriminator.mapping, "ConfigurationDetails.discriminator.mapping");
  const runtimeByType = new Map(input.runtimeMetadata.map((entry) => [entry.type, entry]));
  const platforms = enumValues(schemas.Platform);
  const enrollmentTypes = enumValues(schemas.EnrollmentType);
  const configurationTypes = Object.entries(mapping)
    .map(([type, ref]) => {
      if (typeof ref !== "string") {
        throw new Error(`Invalid schema ref for ${type}`);
      }
      const schemaName = ref.split("/").at(-1);
      if (schemaName === undefined || schemas[schemaName] === undefined) {
        throw new Error(`Missing schema ${String(schemaName)} for ${type}`);
      }
      const runtime = runtimeByType.get(type) ?? heuristicMetadata(type, platforms);
      const schema = schemas[schemaName];
      const required = requiredProperties(schema, schemas);
      const description = cleanDescription(typeof schema.description === "string" ? schema.description : undefined);
      return {
        type,
        label: labelConfigurationType(type),
        ...(description === undefined ? {} : { description, descriptionSource: "schema" as const }),
        schemaName,
        platforms: runtime.platforms,
        enrollmentTypes: runtime.enrollmentTypes,
        multiConfig: runtime.multiConfig,
        portalHidden: runtime.portalHidden,
        placeholders: runtime.placeholders,
        required,
        fields: collectFields(schema, schemas),
      } satisfies ConfigurationTemplate;
    })
    .sort((left, right) => left.type.localeCompare(right.type));
  const refreshDiagnostics = input.refreshDiagnostics ?? {
    runtimeMetadata: {
      source: input.runtimeMetadata.length > 0 ? "reflected" : "heuristic",
      reflectedCount: input.runtimeMetadata.length,
      configurationTypeCount: input.runtimeMetadata.length,
    },
    iosSystemAppsLoaded: input.iosSystemApps !== undefined && input.iosSystemApps !== null && !isEmptyValue(input.iosSystemApps),
    springConfigurationMetadataLoaded:
      input.springConfigurationMetadata !== undefined && input.springConfigurationMetadata !== null && !isEmptyValue(input.springConfigurationMetadata),
  };

  return withTemplateFieldMetadata({
    serverVersion: input.serverVersion,
    sourceImage: input.sourceImage,
    sourceImageDigest: input.sourceImageDigest,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    refreshDiagnostics,
    platforms,
    enrollmentTypes,
    configurationTypes,
    schemas,
    iosSystemApps: input.iosSystemApps,
    springConfigurationMetadata: input.springConfigurationMetadata,
  });
}

export function defaultValueForSchema(schema: unknown, schemas: Record<string, JsonObject>): unknown {
  const resolved = resolveSchema(schema, schemas);
  if (resolved === undefined) {
    return null;
  }
  const enumOptions = enumValues(resolved);
  if (enumOptions.length > 0) {
    return enumOptions[0] ?? null;
  }
  const type = schemaType(resolved);
  if (type === "boolean") {
    return false;
  }
  if (type === "integer" || type === "number") {
    return 0;
  }
  if (type === "array") {
    return [];
  }
  if (type === "object") {
    const value: Record<string, unknown> = {};
    const required = requiredProperties(resolved, schemas);
    const properties = objectProperties(resolved, schemas);
    for (const property of required) {
      const propertySchema = properties[property];
      if (propertySchema !== undefined) {
        value[property] = defaultValueForSchema(propertySchema, schemas);
      }
    }
    return value;
  }
  return "";
}

function isEmptyValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (isObject(value)) {
    return Object.keys(value).length === 0;
  }
  return false;
}

function withRefreshDiagnostics(bundle: RelutionTemplateBundle): RelutionTemplateBundle {
  return {
    ...bundle,
    refreshDiagnostics: bundle.refreshDiagnostics ?? {
      runtimeMetadata: {
        source: "reflected",
        reflectedCount: bundle.configurationTypes.length,
        configurationTypeCount: bundle.configurationTypes.length,
      },
      iosSystemAppsLoaded: bundle.iosSystemApps !== undefined && bundle.iosSystemApps !== null && !isEmptyValue(bundle.iosSystemApps),
      springConfigurationMetadataLoaded:
        bundle.springConfigurationMetadata !== undefined &&
        bundle.springConfigurationMetadata !== null &&
        !isEmptyValue(bundle.springConfigurationMetadata),
    },
  };
}

function withTemplateFieldMetadata(bundle: RelutionTemplateBundle): RelutionTemplateBundle {
  return {
    ...bundle,
    configurationTypes: bundle.configurationTypes.map((template) => {
      const schema = bundle.schemas[template.schemaName];
      if (schema === undefined) {
        return template;
      }
      return {
        ...template,
        fields: collectFields(schema, bundle.schemas),
      };
    }),
  };
}

export function requiredProperties(schema: unknown, schemas: Record<string, JsonObject>): string[] {
  const resolved = resolveAllOf(schema, schemas);
  const result = new Set<string>();
  for (const candidate of resolved) {
    const required = candidate.required;
    if (Array.isArray(required)) {
      for (const item of required) {
        if (typeof item === "string") {
          result.add(item);
        }
      }
    }
  }
  return [...result].sort();
}

export function objectProperties(schema: unknown, schemas: Record<string, JsonObject>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const candidate of resolveAllOf(schema, schemas)) {
    const candidateProperties = candidate.properties;
    if (isObject(candidateProperties)) {
      Object.assign(properties, candidateProperties);
    }
  }
  return properties;
}

function collectFields(
  schema: unknown,
  schemas: Record<string, JsonObject>,
  prefix = "",
  requiredAtLevel = new Set<string>(),
  seenRefs = new Set<string>(),
): TemplateField[] {
  const fields: TemplateField[] = [];
  const properties = objectProperties(schema, schemas);
  const required = new Set(requiredProperties(schema, schemas));

  for (const [name, propertySchema] of Object.entries(properties)) {
    const path = prefix.length > 0 ? `${prefix}.${name}` : name;
    const resolved = resolveSchema(propertySchema, schemas) ?? {};
    const kind = schemaType(resolved);
    const ref = schemaRef(propertySchema);
    const field: TemplateField = {
      path,
      label: labelFieldPath(path),
      kind,
      required: required.has(name) || requiredAtLevel.has(path),
      nullable: resolved.nullable === true,
      enumValues: enumValues(resolved),
      enumLabels: enumLabels(resolved),
    };
    const description = cleanDescription(typeof resolved.description === "string" ? resolved.description : undefined);
    if (description !== undefined) {
      field.description = description;
      field.descriptionSource = "openapi";
    }
    if (resolved.default !== undefined) {
      field.defaultValue = resolved.default;
    }
    const items = asMaybeObject(resolved.items);
    if (items !== undefined) {
      const resolvedItems = resolveSchema(items, schemas);
      field.itemKind = schemaType(resolvedItems ?? items);
      const itemRef = schemaRef(items);
      if (field.itemKind === "object" && (itemRef === undefined || !seenRefs.has(itemRef))) {
        const itemFields = collectFields(
          resolvedItems ?? items,
          schemas,
          "",
          new Set<string>(),
          itemRef === undefined ? seenRefs : new Set([...seenRefs, itemRef]),
        );
        if (itemFields.length > 0) {
          field.itemFields = itemFields;
        }
      }
    }
    if (ref !== undefined) {
      field.ref = ref;
    }
    fields.push(field);

    if (kind === "object" && !path.endsWith(".uuid") && (ref === undefined || !seenRefs.has(ref))) {
      fields.push(
        ...collectFields(
          resolved,
          schemas,
          path,
          requiredAtLevel,
          ref === undefined ? seenRefs : new Set([...seenRefs, ref]),
        ),
      );
    }
  }

  return fields;
}

function resolveAllOf(schema: unknown, schemas: Record<string, JsonObject>, seenRefs = new Set<string>()): JsonObject[] {
  const ref = schemaRefName(schema);
  if (ref !== undefined && seenRefs.has(ref)) {
    return [];
  }
  const nextSeenRefs = ref === undefined ? seenRefs : new Set([...seenRefs, ref]);
  const resolved = resolveSchema(schema, schemas);
  if (resolved === undefined) {
    return [];
  }
  const allOf = resolved.allOf;
  if (!Array.isArray(allOf)) {
    return [resolved];
  }
  return [resolved, ...allOf.flatMap((entry) => resolveAllOf(entry, schemas, nextSeenRefs))];
}

function resolveSchema(schema: unknown, schemas: Record<string, JsonObject>): JsonObject | undefined {
  const record = asMaybeObject(schema);
  if (record === undefined) {
    return undefined;
  }
  const ref = record.$ref;
  if (typeof ref !== "string") {
    return record;
  }
  const schemaName = ref.split("/").at(-1);
  if (schemaName === undefined) {
    return record;
  }
  return schemas[schemaName] ?? record;
}

function schemaRefName(schema: unknown): string | undefined {
  const record = asMaybeObject(schema);
  if (record === undefined || typeof record.$ref !== "string") {
    return undefined;
  }
  return record.$ref.split("/").at(-1);
}

function enumValues(schema: unknown): string[] {
  const record = asMaybeObject(schema);
  const values = record?.enum;
  if (!Array.isArray(values)) {
    return [];
  }
  return values.filter((value): value is string => typeof value === "string");
}

function enumLabels(schema: unknown): Record<string, string> {
  return Object.fromEntries(enumValues(schema).map((value) => [value, labelEnumValue(value)]));
}

function labelConfigurationType(type: string): string {
  return labelFromWords(type.split("_"));
}

function labelFieldPath(path: string): string {
  return labelFromWords(path.split(".").flatMap((part) => splitIdentifier(part)));
}

function labelEnumValue(value: string): string {
  return labelFromWords(value.split(/[_\s-]+/u).flatMap((part) => splitIdentifier(part)));
}

function labelFromWords(words: string[]): string {
  const labels = words.filter((word) => word.length > 0).map((word) => labelWord(word));
  return joinSpecialLabels(labels).join(" ");
}

function labelWord(word: string): string {
  const upper = word.toUpperCase();
  const mapped = WORD_LABELS[upper];
  if (mapped !== undefined) {
    return mapped;
  }
  if (/^\d+$/u.test(word)) {
    return word;
  }
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function splitIdentifier(identifier: string): string[] {
  const matches = identifier.match(/[A-Z]+(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+/gu);
  return matches ?? [identifier];
}

function joinSpecialLabels(labels: string[]): string[] {
  const joined: string[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const current = labels[index];
    const next = labels[index + 1];
    if (current === undefined) {
      continue;
    }
    if (current === "File" && next === "Vault") {
      joined.push("FileVault");
      index += 1;
    } else if (current === "MAC" && next === "OS") {
      joined.push("macOS");
      index += 1;
    } else if (current === "I" && next === "OS") {
      joined.push("iOS");
      index += 1;
    } else if (current === "Wi" && next === "Fi") {
      joined.push("Wi-Fi");
      index += 1;
    } else if (current === "PKCS" && next !== undefined && /^\d+$/u.test(next)) {
      joined.push(`${current}${next}`);
      index += 1;
    } else if ((current === "WPA" || current === "WEP") && next !== undefined && /^\d+$/u.test(next)) {
      joined.push(`${current}${next}`);
      index += 1;
    } else if (current === "Cal" && next === "DAV") {
      joined.push("CalDAV");
      index += 1;
    } else if (current === "Card" && next === "DAV") {
      joined.push("CardDAV");
      index += 1;
    } else {
      joined.push(current);
    }
  }
  return joined;
}

function cleanDescription(description: string | undefined): string | undefined {
  if (description === undefined) {
    return undefined;
  }
  const text = description
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > 0 ? text : undefined;
}

function schemaType(schema: JsonObject): string {
  const type = schema.type;
  if (typeof type === "string") {
    return type;
  }
  if (Array.isArray(type)) {
    return type.filter((value): value is string => typeof value === "string").join("|");
  }
  if (schema.properties !== undefined || schema.allOf !== undefined) {
    return "object";
  }
  if (schema.enum !== undefined) {
    return "string";
  }
  return "unknown";
}

function heuristicMetadata(type: string, allPlatforms: string[]): RuntimeConfigurationTypeMetadata {
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
  if (type.startsWith("ANDROID_ENTERPRISE_")) {
    return ["ANDROID_ENTERPRISE"];
  }
  if (type.startsWith("ANDROID_")) {
    return ["ANDROID"];
  }
  if (type.startsWith("IOS_") || type === "MSCA_REQUIRED") {
    return ["IOS"];
  }
  if (type.startsWith("MACOS_")) {
    return ["MACOS"];
  }
  if (type.startsWith("TVOS_") || type === "AIRPLAY_SECURITY") {
    return ["TVOS"];
  }
  if (type.startsWith("WINDOWS_")) {
    return ["WINDOWS"];
  }
  if (type.startsWith("CHROMEOS_")) {
    return ["CHROMEOS"];
  }
  if (type.startsWith("LINUX_")) {
    return ["LINUX"];
  }
  if (type.startsWith("APPLE_")) {
    return ["IOS", "MACOS", "TVOS", "WATCHOS", "VISIONOS"].filter((platform) => allPlatforms.includes(platform));
  }
  if (type.startsWith("IOT_")) {
    return ["EDGEROUTER", "BLENODE", "ASSET", "BEACON", "KNX", "BACNET", "VIRTUAL", "LORAWAN"].filter((platform) =>
      allPlatforms.includes(platform),
    );
  }
  return allPlatforms;
}

function asObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value;
}

function asMaybeObject(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

function schemaRef(value: unknown): string | undefined {
  const record = asMaybeObject(value);
  return typeof record?.$ref === "string" ? record.$ref : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

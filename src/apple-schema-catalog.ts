import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import type {
  AppleAvailability,
  AppleSchemaCatalog,
  AppleSchemaEntry,
  AppleSchemaField,
  AppleSchemaFieldKind,
  AppleSchemaKind,
} from "./apple-schema.js";

export interface RefreshAppleSchemaOptions {
  out?: string;
  revision?: string;
  source?: string;
}

interface SourcePath {
  kind: AppleSchemaKind;
  path: string;
}

type JsonRecord = Record<string, unknown>;

export const DEFAULT_APPLE_SCHEMA_CATALOG_PATH = "data/apple-device-management/catalog.json";
const BUNDLED_APPLE_SCHEMA_CATALOG_PATH = fileURLToPath(new URL("../../data/apple-device-management/catalog.json", import.meta.url));
export const APPLE_DEVICE_MANAGEMENT_REPOSITORY = "https://github.com/apple/device-management";
export const DEFAULT_APPLE_SCHEMA_REVISION = "release";

const GITHUB_API_ROOT = "https://api.github.com/repos/apple/device-management/contents";
const SOURCE_PATHS: SourcePath[] = [
  { kind: "profile", path: "mdm/profiles" },
  { kind: "ddm-configuration", path: "declarative/declarations/configurations" },
  { kind: "ddm-asset", path: "declarative/declarations/assets" },
  { kind: "ddm-activation", path: "declarative/declarations/activations" },
  { kind: "ddm-management", path: "declarative/declarations/management" },
  { kind: "ddm-status", path: "declarative/status" },
  { kind: "mdm-command", path: "mdm/commands" },
  { kind: "mdm-checkin", path: "mdm/checkin" },
  { kind: "ddm-protocol", path: "declarative/protocol" },
];

export function loadAppleSchemaCatalog(path = DEFAULT_APPLE_SCHEMA_CATALOG_PATH): AppleSchemaCatalog {
  const resolved = path === DEFAULT_APPLE_SCHEMA_CATALOG_PATH ? BUNDLED_APPLE_SCHEMA_CATALOG_PATH : resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`Apple schema catalog not found: ${resolved}. Run rexp apple-schema refresh first.`);
  }
  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid Apple schema catalog: ${resolved}`);
  }
  return parsed as unknown as AppleSchemaCatalog;
}

export async function refreshAppleSchemaCatalog(options: RefreshAppleSchemaOptions = {}): Promise<AppleSchemaCatalog> {
  const revision = options.revision ?? DEFAULT_APPLE_SCHEMA_REVISION;
  const out = options.out ?? DEFAULT_APPLE_SCHEMA_CATALOG_PATH;
  assertRevisionMatchesOutputPath(revision, out);
  const documents = options.source === undefined || options.source.startsWith("http")
    ? await readRemoteDocuments(revision)
    : readLocalDocuments(options.source);
  const normalizedEntries = documents
    .map((document) => normalizeSchemaDocument(document.kind, document.path, document.content))
    .filter((entry): entry is AppleSchemaEntry => entry !== undefined)
    .map((entry) => ({ ...entry, id: "" }))
    .sort((left, right) => `${left.kind}:${left.title}`.localeCompare(`${right.kind}:${right.title}`));
  const entries = assignSchemaIds(normalizedEntries)
    .sort((left, right) => `${left.kind}:${left.title}`.localeCompare(`${right.kind}:${right.title}`));
  const catalog: AppleSchemaCatalog = {
    version: 1,
    source: {
      repository: APPLE_DEVICE_MANAGEMENT_REPOSITORY,
      revision,
      generatedAt: new Date().toISOString(),
    },
    counts: createCounts(entries),
    entries,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

async function readRemoteDocuments(revision: string): Promise<Array<{ kind: AppleSchemaKind; path: string; content: string }>> {
  const documents: Array<{ kind: AppleSchemaKind; path: string; content: string }> = [];
  for (const source of SOURCE_PATHS) {
    const files = await readRemoteDirectory(source.path, revision);
    for (const file of files) {
      if (!file.name.endsWith(".yaml") || file.downloadUrl === undefined) {
        continue;
      }
      const response = await fetch(file.downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${file.downloadUrl}: ${response.status} ${response.statusText}`);
      }
      documents.push({ kind: source.kind, path: `${source.path}/${file.name}`, content: await response.text() });
    }
  }
  return documents;
}

async function readRemoteDirectory(path: string, revision: string): Promise<Array<{ name: string; downloadUrl?: string }>> {
  const response = await fetch(`${GITHUB_API_ROOT}/${path}?ref=${encodeURIComponent(revision)}`);
  if (!response.ok) {
    throw new Error(`Failed to list Apple schema path ${path}: ${response.status} ${response.statusText}`);
  }
  const parsed = await response.json() as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Unexpected GitHub directory response for ${path}`);
  }
  return parsed
    .map((entry) => {
      const record = isRecord(entry) ? entry : {};
      const name = typeof record.name === "string" ? record.name : "";
      const downloadUrl = typeof record.download_url === "string" ? record.download_url : undefined;
      return downloadUrl === undefined ? { name } : { name, downloadUrl };
    })
    .filter((entry) => entry.name.length > 0);
}

function readLocalDocuments(root: string): Array<{ kind: AppleSchemaKind; path: string; content: string }> {
  const documents: Array<{ kind: AppleSchemaKind; path: string; content: string }> = [];
  for (const source of SOURCE_PATHS) {
    const directory = join(root, source.path);
    if (!existsSync(directory)) {
      continue;
    }
    for (const name of readdirSync(directory).sort()) {
      if (name.endsWith(".yaml")) {
        documents.push({
          kind: source.kind,
          path: `${source.path}/${name}`,
          content: readFileSync(join(directory, name), "utf8"),
        });
      }
    }
  }
  return documents;
}

function normalizeSchemaDocument(kind: AppleSchemaKind, sourcePath: string, content: string): AppleSchemaEntry | undefined {
  const parsed = loadYaml(content) as unknown;
  if (!isRecord(parsed)) {
    return undefined;
  }
  const payload = isRecord(parsed.payload) ? parsed.payload : {};
  if (sourcePath.includes("TopLevel")) {
    return undefined;
  }
  const identifier = identifierFromPayload(kind, payload);
  if (identifier.length === 0 && sourcePath.includes("CommonPayloadKeys")) {
    return undefined;
  }
  const title = stringValue(parsed.title) ?? titleFromPath(sourcePath);
  const description = stringValue(parsed.description) ?? "";
  const deprecated = sourcePath.includes("/Deprecated/") || sourcePath.includes("deprecated");
  return {
    id: "",
    kind,
    title,
    description,
    identifier,
    sourcePath,
    availability: availabilityFromPayload(kind, payload, deprecated),
    deprecated,
    fields: payloadKeys(parsed).map((entry) => normalizeField(entry)).filter((entry): entry is AppleSchemaField => entry !== undefined),
  };
}

function normalizeField(value: unknown): AppleSchemaField | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const key = stringValue(value.key);
  if (key === undefined || key.length === 0) {
    return undefined;
  }
  const kind = kindFromFieldDefinition(value);
  const required = value.presence === "required";
  return {
    path: key,
    payloadKey: key,
    title: stringValue(value.title) ?? labelFromIdentifier(key),
    kind,
    required,
    description: stringValue(value.content) ?? "",
    defaultValue: value.default ?? defaultValueForKind(kind),
    enumValues: arrayOfStrings(value.rangelist),
    variableSafe: kind === "string" || kind === "textarea",
  };
}

function identifierFromPayload(kind: AppleSchemaKind, payload: JsonRecord): string {
  const keys: string[] = kind === "profile"
    ? ["payloadtype"]
    : kind === "mdm-command" || kind === "mdm-checkin"
      ? ["requesttype", "checkintype"]
      : kind === "ddm-status"
        ? ["statusitemtype"]
        : ["declarationtype", "assettype", "activationtype", "managementtype", "protocoltype"];
  for (const key of keys) {
    const value = stringValue(payload[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return "";
}

function availabilityFromPayload(kind: AppleSchemaKind, payload: JsonRecord, deprecated: boolean): AppleAvailability {
  const supported = isRecord(payload.supportedOS) ? payload.supportedOS : {};
  const platforms = Object.keys(supported).flatMap((platform) => {
    const mapped = relutionPlatform(platform);
    const detail = isRecord(supported[platform]) ? supported[platform] : {};
    return mapped !== undefined && detail.introduced !== "n/a" ? [mapped] : [];
  });
  const supportedEntries = Object.values(supported).filter(isRecord);
  const allowMultiple = supportedEntries.some((entry) => entry.multiple === true);
  const manualInstallKnown = supportedEntries.some((entry) => typeof entry.allowmanualinstall === "boolean");
  const requiresMdm = kind !== "profile" || (manualInstallKnown && supportedEntries.every((entry) => entry.allowmanualinstall === false));
  return {
    platforms: [...new Set(platforms)].sort(),
    allowMultiple,
    requiresMdm,
    deprecated,
    notes: availabilityNotes(supportedEntries),
  };
}

function availabilityNotes(entries: JsonRecord[]): string[] {
  const notes = new Set<string>();
  if (entries.some((entry) => entry.supervised === true)) {
    notes.add("Requires supervised devices on at least one platform.");
  }
  if (entries.some((entry) => entry.requiresdep === true)) {
    notes.add("Requires automated device enrollment on at least one platform.");
  }
  if (entries.some((entry) => entry.userapprovedmdm === true)) {
    notes.add("Requires user-approved MDM on at least one platform.");
  }
  return [...notes].sort();
}

function kindFromAppleType(type: string | undefined): AppleSchemaFieldKind {
  if (type === "<boolean>") {
    return "boolean";
  }
  if (type === "<integer>") {
    return "integer";
  }
  if (type === "<real>" || type === "<number>") {
    return "number";
  }
  if (type === "<array>") {
    return "list";
  }
  if (type === "<dictionary>") {
    return "json";
  }
  if (type === "<data>") {
    return "data";
  }
  return "string";
}

function kindFromFieldDefinition(value: JsonRecord): AppleSchemaFieldKind {
  const type = stringValue(value.type);
  if (type !== "<array>") {
    return kindFromAppleType(type);
  }
  const subkeys = Array.isArray(value.subkeys) ? value.subkeys.filter(isRecord) : [];
  if (subkeys.length !== 1) {
    return "json";
  }
  const childType = stringValue(subkeys[0]?.type);
  return childType === "<string>" ? "list" : "json";
}

function defaultValueForKind(kind: AppleSchemaFieldKind): unknown {
  switch (kind) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "list":
      return [];
    case "json":
      return "{}";
    default:
      return "";
  }
}

function payloadKeys(parsed: JsonRecord): unknown[] {
  return Array.isArray(parsed.payloadkeys) ? parsed.payloadkeys : [];
}

function createCounts(entries: AppleSchemaEntry[]): Record<AppleSchemaKind, number> {
  const counts: Record<AppleSchemaKind, number> = {
    profile: 0,
    "ddm-configuration": 0,
    "ddm-asset": 0,
    "ddm-activation": 0,
    "ddm-management": 0,
    "ddm-status": 0,
    "mdm-command": 0,
    "mdm-checkin": 0,
    "ddm-protocol": 0,
  };
  for (const entry of entries) {
    counts[entry.kind] += 1;
  }
  return counts;
}

function schemaId(kind: AppleSchemaKind, identifier: string, sourcePath: string): string {
  const base = identifier.length > 0 ? identifier : sourcePath.split("/").at(-1)?.replace(/\.yaml$/u, "") ?? sourcePath;
  return `${kind}:${base}`;
}

function assignSchemaIds(entries: AppleSchemaEntry[]): AppleSchemaEntry[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.identifier.length > 0 ? entry.identifier : entry.sourcePath}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entries.map((entry) => {
    const key = `${entry.kind}:${entry.identifier.length > 0 ? entry.identifier : entry.sourcePath}`;
    const duplicateCount = counts.get(key) ?? 0;
    return {
      ...entry,
      id: duplicateCount > 1 ? `${schemaId(entry.kind, entry.identifier, entry.sourcePath)}:${stableSourceSuffix(entry.sourcePath)}` : schemaId(entry.kind, entry.identifier, entry.sourcePath),
    };
  });
}

function stableSourceSuffix(sourcePath: string): string {
  return sourcePath.replace(/\.yaml$/u, "").replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").toLowerCase();
}

function assertRevisionMatchesOutputPath(revision: string, out: string): void {
  if (revision === "release" && /apple-device-management-\d/u.test(out)) {
    throw new Error(`Refusing to write floating release data to a version-labeled path: ${out}`);
  }
}

function relutionPlatform(platform: string): string | undefined {
  switch (platform) {
    case "iOS":
    case "iPadOS":
      return "IOS";
    case "macOS":
      return "MACOS";
    case "tvOS":
      return "TVOS";
    case "watchOS":
      return "WATCHOS";
    case "visionOS":
      return "VISIONOS";
    default:
      return undefined;
  }
}

function titleFromPath(path: string): string {
  return labelFromIdentifier(path.split("/").at(-1)?.replace(/\.yaml$/u, "") ?? path);
}

function labelFromIdentifier(identifier: string): string {
  return identifier
    .replace(/^com\.apple\./u, "")
    .split(/[.\-_]/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

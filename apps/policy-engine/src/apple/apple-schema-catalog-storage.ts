/** Owns the stable on-disk representation of the Apple schema catalog. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppleSchemaCatalog, AppleSchemaKind } from "./apple-schema-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export const DEFAULT_APPLE_SCHEMA_CATALOG_PATH = "data/apple-device-management/catalog.json";
export const DEFAULT_APPLE_SCHEMA_REVISION = "release";
const BUNDLED_APPLE_SCHEMA_CATALOG_PATH = fileURLToPath(new URL("../../../data/apple-device-management/catalog.json", import.meta.url));

export interface AppleSchemaDocument {
  kind: AppleSchemaKind;
  path: string;
  content: string;
}

interface AppleSchemaSourcePath {
  kind: AppleSchemaKind;
  path: string;
}

export const APPLE_SCHEMA_SOURCE_PATHS: AppleSchemaSourcePath[] = [
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

export function loadStoredAppleSchemaCatalog(path: string): AppleSchemaCatalog {
  const resolved = path === DEFAULT_APPLE_SCHEMA_CATALOG_PATH ? BUNDLED_APPLE_SCHEMA_CATALOG_PATH : resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`Apple schema catalog not found: ${resolved}. Run rexp apple-schema refresh first.`);
  }
  const parsed = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  const catalog = asRecord(parsed);
  if (catalog === undefined || catalog.version !== 1 || !Array.isArray(catalog.entries)) {
    throw new Error(`Invalid Apple schema catalog: ${resolved}`);
  }
  return parsed as AppleSchemaCatalog;
}

export function writeAppleSchemaCatalog(out: string, catalog: AppleSchemaCatalog): void {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`);
}

export function isKnownAppleSchemaSourcePath(path: string): boolean {
  return APPLE_SCHEMA_SOURCE_PATHS.some((source) => source.path === path);
}

export function readLocalAppleSchemaDocuments(root: string): AppleSchemaDocument[] {
  const documents: AppleSchemaDocument[] = [];
  for (const source of APPLE_SCHEMA_SOURCE_PATHS) {
    const directory = join(root, source.path);
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory).sort()) {
      if (name.endsWith(".yaml")) {
        documents.push({ kind: source.kind, path: `${source.path}/${name}`, content: readFileSync(join(directory, name), "utf8") });
      }
    }
  }
  return documents;
}

export function assertAppleSchemaRevisionMatchesOutputPath(revision: string, out: string): void {
  if (revision === "release" && /apple-device-management-\d+(?:\.\d+)*\/catalog\.json$/u.test(out)) {
    throw new Error(`Refusing to write floating release data to a version-labeled path: ${out}`);
  }
}

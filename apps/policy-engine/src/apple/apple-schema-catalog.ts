/** Loads, refreshes, and persists the local Apple schema catalog. */
import type { AppleSchemaCatalog, AppleSchemaEntry } from "./apple-schema-types.js";
import { assignAppleSchemaIds, createAppleSchemaCounts } from "./apple-schema-catalog-identifiers.js";
import { normalizeAppleSchemaDocument } from "./apple-schema-catalog-normalization.js";
import { readRemoteAppleSchemaDocuments } from "./apple-schema-catalog-remote.js";
import {
  assertAppleSchemaRevisionMatchesOutputPath,
  DEFAULT_APPLE_SCHEMA_CATALOG_PATH,
  DEFAULT_APPLE_SCHEMA_REVISION,
  loadStoredAppleSchemaCatalog,
  readLocalAppleSchemaDocuments,
  writeAppleSchemaCatalog,
} from "./apple-schema-catalog-storage.js";

export interface RefreshAppleSchemaOptions {
  out?: string;
  revision?: string;
  source?: string;
}

const APPLE_DEVICE_MANAGEMENT_REPOSITORY = "https://github.com/apple/device-management";

export function loadAppleSchemaCatalog(path = DEFAULT_APPLE_SCHEMA_CATALOG_PATH): AppleSchemaCatalog {
  return loadStoredAppleSchemaCatalog(path);
}

export async function refreshAppleSchemaCatalog(options: RefreshAppleSchemaOptions = {}): Promise<AppleSchemaCatalog> {
  const revision = options.revision ?? DEFAULT_APPLE_SCHEMA_REVISION;
  const out = options.out ?? DEFAULT_APPLE_SCHEMA_CATALOG_PATH;
  assertAppleSchemaRevisionMatchesOutputPath(revision, out);
  const documents = options.source === undefined || options.source.startsWith("http")
    ? await readRemoteAppleSchemaDocuments(revision)
    : readLocalAppleSchemaDocuments(options.source);
  const entries = createCatalogEntries(documents);
  const catalog: AppleSchemaCatalog = {
    version: 1,
    source: {
      repository: APPLE_DEVICE_MANAGEMENT_REPOSITORY,
      revision,
      generatedAt: new Date().toISOString(),
    },
    counts: createAppleSchemaCounts(entries),
    entries,
  };
  writeAppleSchemaCatalog(out, catalog);
  return catalog;
}

function createCatalogEntries(documents: Parameters<typeof normalizeAppleSchemaDocument>[0][]): AppleSchemaEntry[] {
  const entries = documents
    .map(normalizeAppleSchemaDocument)
    .filter((entry): entry is AppleSchemaEntry => entry !== undefined)
    .map((entry) => ({ ...entry, id: "" }));
  return assignAppleSchemaIds(entries)
    .sort((left, right) => `${left.kind}:${left.title}`.localeCompare(`${right.kind}:${right.title}`));
}

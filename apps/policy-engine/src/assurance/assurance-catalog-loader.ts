/** Loads current provenance-bound assurance artifacts without cross-request caching. */
import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AssuranceCatalog,
  AssuranceCatalogLoadResult,
  AssuranceDetailEntry,
  AssuranceDetailsCatalog,
  AssuranceSnapshotEntry,
  AssuranceSnapshotIndex,
} from "./assurance-contracts.js";
import { parseAssuranceCatalog, parseAssurancePresetCatalog } from "./assurance-catalog-validation.js";
import { canonicalJsonSha256 } from "../platform/serialization/canonical-json.js";
import { assuranceCanonicalDigest } from "./assurance-json.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { resolveSymlinkFreePath } from "../platform/filesystem/path-safety.js";

const DEFAULT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_CATALOG_PATH = "example/recommendation-coverage/assurance-catalog.json";
const DEFAULT_PRESETS_PATH = "example/recommendation-coverage/assurance-presets.json";
const DEFAULT_DETAILS_PATH = "example/recommendation-coverage/assurance-details.json";
const SNAPSHOT_ROOT_PATH = "example/recommendation-coverage/assurance-snapshots";
const SNAPSHOT_INDEX_PATH = `${SNAPSHOT_ROOT_PATH}/index.json`;

export interface AssuranceCatalogRootOptions {
  readonly rootDir?: string;
  readonly catalogPath?: string;
  readonly presetsPath?: string;
  readonly snapshotDigest?: string;
}

export function loadAssuranceCatalog(options: AssuranceCatalogRootOptions = {}): AssuranceCatalogLoadResult {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  try {
    const paths = resolveArtifactPaths(rootDir, options);
    const catalog = parseAssuranceCatalog(readJson(paths.catalogPath, "assurance catalog"));
    if (paths.expectedCatalogDigest !== undefined && assuranceCanonicalDigest(catalog) !== paths.expectedCatalogDigest) {
      throw new Error("Assurance catalog does not match the indexed digest");
    }
    if (paths.expectedArtifactVersion !== undefined && catalog.artifactVersion !== paths.expectedArtifactVersion) {
      throw new Error("Assurance catalog does not match the indexed artifact version");
    }
    if (paths.expectedCorpusDigest !== undefined && catalog.corpusDigest !== paths.expectedCorpusDigest) {
      throw new Error("Assurance catalog does not match the indexed corpus digest");
    }
    const presets = parseAssurancePresetCatalog(readJson(paths.presetsPath, "assurance presets"), catalog);
    const details = parseAssuranceDetails(readJson(paths.detailsPath, "assurance details"), catalog);
    const detailsDigest = assuranceCanonicalDigest(details);
    if (paths.expectedDetailsDigest !== undefined && detailsDigest !== paths.expectedDetailsDigest) {
      throw new Error("Assurance details do not match the indexed digest");
    }
    if (catalog.recommendations.some((entry) => entry.detailReference.detailsPath !== DEFAULT_DETAILS_PATH)) {
      throw new Error("Assurance recommendation detail references do not match their selected snapshot");
    }
    const sourceDigests = Object.fromEntries(catalog.sources.map((source) => [source.sourceId, source.digest]));
    const snapshotDigest = assuranceCanonicalDigest({ catalog, presets });
    if (paths.expectedSnapshotDigest !== undefined && snapshotDigest !== paths.expectedSnapshotDigest) {
      throw new Error("Assurance snapshot contents do not match the indexed digest");
    }
    return {
      status: "available",
      catalog,
      presets,
      sourceDigests,
      presetDigest: assuranceCanonicalDigest(presets),
      assuranceDigest: snapshotDigest,
      snapshotDigest,
      detailsDigest,
    };
  } catch (error) {
    return { status: "unavailable", error: error instanceof Error ? error.message : "Assurance artifacts are unavailable" };
  }
}

export function loadAssuranceDetail(
  recommendationId: string,
  options: AssuranceCatalogRootOptions = {},
): AssuranceDetailEntry {
  const rootDir = options.rootDir ?? DEFAULT_ROOT;
  const paths = resolveArtifactPaths(rootDir, options);
  const catalog = parseAssuranceCatalog(readJson(paths.catalogPath, "assurance catalog"));
  const details = parseAssuranceDetails(readJson(paths.detailsPath, "assurance details"), catalog);
  const detailsDigest = assuranceCanonicalDigest(details);
  if (paths.expectedDetailsDigest !== undefined && detailsDigest !== paths.expectedDetailsDigest) throw new Error("Assurance details do not match the indexed digest");
  const recommendation = catalog.recommendations.find((entry) => entry.id === recommendationId);
  const detail = details.recommendations.find((entry) => entry.id === recommendation?.detailReference.lookupId);
  if (recommendation === undefined || detail === undefined) throw new Error(`Assurance recommendation detail not found: ${recommendationId}`);
  return detail;
}

export function listAssuranceSnapshots(options: Pick<AssuranceCatalogRootOptions, "rootDir"> = {}): AssuranceSnapshotIndex {
  return parseSnapshotIndex(readJson(resolve(options.rootDir ?? DEFAULT_ROOT, SNAPSHOT_INDEX_PATH), "assurance snapshot index"));
}

function bindAssuranceDecisionsDigest(input: {
  readonly assuranceDigest: string;
  readonly decisions: readonly unknown[];
}): string {
  if (!/^[a-f0-9]{64}$/u.test(input.assuranceDigest)) throw new Error("Assurance digest must be a SHA-256 digest");
  return canonicalJsonSha256({ assuranceDigest: input.assuranceDigest, decisions: input.decisions });
}

export function currentAssuranceDigest(
  decisions: readonly unknown[],
  options: AssuranceCatalogRootOptions = {},
): string | undefined {
  const loaded = loadAssuranceCatalog(options);
  return loaded.status === "available"
    ? bindAssuranceDecisionsDigest({ assuranceDigest: loaded.assuranceDigest, decisions })
    : undefined;
}

function readJson(path: string, label: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(readBoundedRegularFileNoFollow(path, { label, maxBytes: 64 * 1024 * 1024 }).toString("utf8")) as unknown;
  }
  catch { throw new Error(`Invalid or missing ${label}: ${path}`); }
  return value;
}

function resolveArtifactPaths(rootDir: string, options: AssuranceCatalogRootOptions): {
  readonly catalogPath: string;
  readonly presetsPath: string;
  readonly detailsPath: string;
  readonly expectedSnapshotDigest?: string;
  readonly expectedDetailsDigest?: string;
  readonly expectedCatalogDigest?: string;
  readonly expectedArtifactVersion?: string;
  readonly expectedCorpusDigest?: string;
} {
  if (options.catalogPath !== undefined || options.presetsPath !== undefined) {
    if (options.catalogPath === undefined || options.presetsPath === undefined || options.snapshotDigest !== undefined) {
      throw new Error("Assurance catalogPath and presetsPath must be supplied together without snapshotDigest");
    }
    return {
      catalogPath: resolve(rootDir, options.catalogPath),
      presetsPath: resolve(rootDir, options.presetsPath),
      detailsPath: resolve(rootDir, DEFAULT_DETAILS_PATH),
    };
  }
  let index: AssuranceSnapshotIndex | undefined;
  const indexPath = resolve(rootDir, SNAPSHOT_INDEX_PATH);
  if (existsSync(indexPath)) index = listAssuranceSnapshots({ rootDir });
  else if (options.snapshotDigest !== undefined) throw new Error(`Assurance snapshot index is missing: ${indexPath}`);
  if (index === undefined) {
    return {
      catalogPath: resolve(rootDir, DEFAULT_CATALOG_PATH),
      presetsPath: resolve(rootDir, DEFAULT_PRESETS_PATH),
      detailsPath: resolve(rootDir, DEFAULT_DETAILS_PATH),
    };
  }
  const digest = options.snapshotDigest ?? index.currentSnapshotDigest;
  const entry = index.entries.find((candidate) => candidate.snapshotDigest === digest);
  if (entry === undefined) throw new Error(`Assurance snapshot is not retained: ${digest}`);
  const snapshotRoot = resolve(rootDir, SNAPSHOT_ROOT_PATH);
  const catalogPath = safeSnapshotPath(rootDir, snapshotRoot, entry.catalogPath);
  const presetsPath = safeSnapshotPath(rootDir, snapshotRoot, entry.presetsPath);
  const detailsPath = safeSnapshotPath(rootDir, snapshotRoot, entry.detailsPath);
  return {
    catalogPath,
    presetsPath,
    detailsPath,
    expectedSnapshotDigest: digest,
    expectedDetailsDigest: entry.detailsDigest,
    expectedCatalogDigest: entry.catalogDigest,
    expectedArtifactVersion: entry.artifactVersion,
    expectedCorpusDigest: entry.corpusDigest,
  };
}

function parseSnapshotIndex(value: unknown): AssuranceSnapshotIndex {
  const record = requireRecord(value, "Assurance snapshot index");
  if (record.schemaVersion !== 1) throw new Error("Assurance snapshot index schemaVersion must be 1");
  const currentSnapshotDigest = requireDigest(record.currentSnapshotDigest, "Assurance current snapshot digest");
  if (!Array.isArray(record.entries)) throw new Error("Assurance snapshot entries must be an array");
  const entries = record.entries.map((value, index) => parseSnapshotEntry(value, index));
  if (new Set(entries.map((entry) => entry.snapshotDigest)).size !== entries.length) throw new Error("Assurance snapshot digests must be unique");
  if (!entries.some((entry) => entry.snapshotDigest === currentSnapshotDigest)) throw new Error("Assurance current snapshot is not retained in its index");
  return { schemaVersion: 1, currentSnapshotDigest, entries };
}

function parseSnapshotEntry(value: unknown, index: number): AssuranceSnapshotEntry {
  const label = `Assurance snapshot ${String(index)}`;
  const record = requireRecord(value, label);
  if (record.status !== "retained") throw new Error(`${label} status must be retained`);
  const entry: AssuranceSnapshotEntry = {
    snapshotDigest: requireDigest(record.snapshotDigest, `${label} snapshotDigest`),
    artifactVersion: requireString(record.artifactVersion, `${label} artifactVersion`),
    corpusDigest: requireDigest(record.corpusDigest, `${label} corpusDigest`),
    catalogDigest: requireDigest(record.catalogDigest, `${label} catalogDigest`),
    catalogPath: requireString(record.catalogPath, `${label} catalogPath`),
    presetsPath: requireString(record.presetsPath, `${label} presetsPath`),
    detailsPath: requireString(record.detailsPath, `${label} detailsPath`),
    detailsDigest: requireDigest(record.detailsDigest, `${label} detailsDigest`),
    sourceCheckedAt: requireDate(record.sourceCheckedAt, `${label} sourceCheckedAt`),
    status: "retained",
  };
  return entry;
}

function parseAssuranceDetails(value: unknown, catalog: AssuranceCatalog): AssuranceDetailsCatalog {
  const record = requireRecord(value, "Assurance details");
  if (record.schemaVersion !== 1) throw new Error("Assurance details schemaVersion must be 1");
  const artifactVersion = requireString(record.artifactVersion, "Assurance details artifactVersion");
  if (artifactVersion !== catalog.artifactVersion) throw new Error("Assurance details target a different catalog artifact version");
  const catalogDigest = requireDigest(record.catalogDigest, "Assurance details catalogDigest");
  if (catalogDigest !== assuranceCanonicalDigest(catalog)) throw new Error("Assurance details catalogDigest does not match its catalog");
  if (!Array.isArray(record.recommendations)) throw new Error("Assurance details recommendations must be an array");
  const recommendations = record.recommendations.map((entry, index) => {
    const detail = requireRecord(entry, `Assurance detail ${String(index)}`);
    const fullRecord = requireRecord(detail.record, `Assurance detail ${String(index)} record`);
    const result: AssuranceDetailEntry = {
      id: requireString(detail.id, `Assurance detail ${String(index)} id`),
      sourceId: requireString(detail.sourceId, `Assurance detail ${String(index)} sourceId`),
      sourceRecommendationId: requireString(detail.sourceRecommendationId, `Assurance detail ${String(index)} sourceRecommendationId`),
      record: fullRecord,
    };
    const catalogRecommendation = catalog.recommendations.find((candidate) => candidate.id === result.id);
    if (catalogRecommendation === undefined
      || catalogRecommendation.sourceId !== result.sourceId
      || catalogRecommendation.sourceRecommendationId !== result.sourceRecommendationId) {
      throw new Error(`Assurance detail identity is not present in its catalog: ${result.id}`);
    }
    return result;
  });
  if (new Set(recommendations.map((entry) => entry.id)).size !== recommendations.length) throw new Error("Assurance detail ids must be unique");
  if (catalog.recommendations.some((entry) => !recommendations.some((detail) => detail.id === entry.detailReference.lookupId))) {
    throw new Error("Assurance details omit a catalog recommendation");
  }
  return { schemaVersion: 1, artifactVersion, catalogDigest, recommendations };
}

function safeSnapshotPath(rootDir: string, snapshotRoot: string, path: string): string {
  const resolved = resolve(rootDir, path);
  const child = relative(snapshotRoot, resolved);
  if (child.length === 0 || child.startsWith("..") || child.includes("/../") || child.includes("\\..\\")) {
    throw new Error("Assurance snapshot path leaves the fixed snapshot root");
  }
  return resolveSymlinkFreePath(resolved, "Assurance snapshot path");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireDigest(value: unknown, label: string): string {
  const digest = requireString(value, label);
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error(`${label} must be a SHA-256 digest`);
  return digest;
}

function requireDate(value: unknown, label: string): string {
  const date = requireString(value, label);
  if (!Number.isFinite(Date.parse(date))) throw new Error(`${label} must be an ISO date`);
  return date;
}

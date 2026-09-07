/** Assigns stable catalog identifiers and per-kind counts after normalization. */
import type { AppleSchemaEntry, AppleSchemaKind } from "./apple-schema-types.js";

export function createAppleSchemaCounts(entries: AppleSchemaEntry[]): Record<AppleSchemaKind, number> {
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
  for (const entry of entries) counts[entry.kind] += 1;
  return counts;
}

export function assignAppleSchemaIds(entries: AppleSchemaEntry[]): AppleSchemaEntry[] {
  const duplicateCounts = new Map<string, number>();
  for (const entry of entries) {
    const key = appleSchemaDuplicateKey(entry);
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }
  return entries.map((entry) => ({
    ...entry,
    id: duplicateCounts.get(appleSchemaDuplicateKey(entry))! > 1
      ? `${appleSchemaId(entry)}:${stableAppleSchemaSourceSuffix(entry.sourcePath)}`
      : appleSchemaId(entry),
  }));
}

function appleSchemaDuplicateKey(entry: AppleSchemaEntry): string {
  return `${entry.kind}:${entry.identifier.length > 0 ? entry.identifier : entry.sourcePath}`;
}

function appleSchemaId(entry: AppleSchemaEntry): string {
  const fallback = entry.sourcePath.split("/").at(-1)?.replace(/\.yaml$/u, "") ?? entry.sourcePath;
  return `${entry.kind}:${entry.identifier.length > 0 ? entry.identifier : fallback}`;
}

function stableAppleSchemaSourceSuffix(sourcePath: string): string {
  return sourcePath.replace(/\.yaml$/u, "").replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").toLowerCase();
}

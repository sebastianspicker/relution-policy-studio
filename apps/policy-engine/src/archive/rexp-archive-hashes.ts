/** Validates the authenticated hash-map contract for managed REXP entries. */
import { assertHashManagedProjectPath } from "./rexp-paths.js";
import { sha256Hex } from "./rexp-crypto.js";
import { getRequiredEntry, policyEntries } from "./rexp-archive-validation.js";
import { METADATA_JSON, REPORT_JSON } from "./rexp-format.js";
import type { ZipEntry } from "./zip.js";

export function assertArchiveHashMapDomain(entries: ZipEntry[], hashes: Record<string, string>): void {
  const checkedNames = new Set([METADATA_JSON, REPORT_JSON, ...policyEntries(entries).map((entry) => entry.name)]);
  for (const hashName of Object.keys(hashes)) {
    assertHashManagedProjectPath(hashName);
    if (!checkedNames.has(hashName)) throw new Error(`Archive hash map references unexpected entry: ${hashName}`);
  }
  for (const name of checkedNames) if (hashes[name] === undefined) throw new Error(`Archive hash map is missing ${name}`);
}

export function assertArchiveEntryHashes(entries: ZipEntry[], hashes: Record<string, string>): void {
  assertArchiveHashMapDomain(entries, hashes);
  for (const name of [METADATA_JSON, REPORT_JSON, ...policyEntries(entries).map((entry) => entry.name)]) {
    if (sha256Hex(getRequiredEntry(entries, name).data) !== hashes[name]) throw new Error(`Archive hash mismatch for ${name}`);
  }
}

/** Reads strict bounded REXP ZIP bytes before semantic validation. */
import { resolve } from "node:path";
import { isPolicyPath, policyPathCollisionKey } from "../workspace/policy-path.js";
import { readBoundedRegularFileNoFollow } from "../platform/filesystem/bounded-file-read.js";
import { MAX_REXP_ENTRIES, MAX_REXP_TOTAL_COMPRESSED_BYTES, MAX_REXP_TOTAL_UNCOMPRESSED_BYTES, METADATA_BIN, METADATA_JSON, REPORT_JSON } from "./rexp-format.js";
import { readZip, type ZipEntry, type ZipEntryInput, MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES } from "./zip.js";
import { maximumExceededError } from "./zip-limit-error.js";

export function readRexpEntries(filePath: string): ZipEntry[] { return readRexpArchive(readRegularFile(filePath, "REXP archive")); }

export function readRexpArchive(archive: Buffer): ZipEntry[] {
  const entries = readZip(archive, { maxEntries: MAX_REXP_ENTRIES, maxTotalCompressedBytes: MAX_REXP_TOTAL_COMPRESSED_BYTES, maxTotalUncompressedBytes: MAX_REXP_TOTAL_UNCOMPRESSED_BYTES, strictLayout: true });
  assertRexpEntryNames(entries); return entries;
}

export function assertRexpZipEntryDataLengths(entries: ZipEntryInput[]): void {
  assertRexpZipEntryLengths(entries.map((entry) => ({ name: entry.name, length: entry.data.length })));
}

export function assertRexpZipEntryLengths(entries: ReadonlyArray<{ readonly name: string; readonly length: number }>): void {
  const total = entries.reduce((sum, entry) => sum + entry.length, 0);
  if (entries.length > MAX_REXP_ENTRIES) throw maximumExceededError("REXP archive contains too many entries", entries.length, MAX_REXP_ENTRIES);
  if (total > MAX_REXP_TOTAL_UNCOMPRESSED_BYTES) throw maximumExceededError("REXP archive uncompressed data exceeds the supported size limit", total, MAX_REXP_TOTAL_UNCOMPRESSED_BYTES);
  for (const entry of entries) if (entry.length > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) throw new Error(`REXP entry ${entry.name} exceeds the ZIP per-entry size limit (${String(MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES)} bytes)`);
}

function assertRexpEntryNames(entries: ZipEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.name.includes("\\") || entry.name.includes("\0")) throw new Error(`Archive entry uses an unsafe path separator or NUL: ${entry.name}`);
    if (!(entry.name === METADATA_JSON || entry.name === REPORT_JSON || entry.name === METADATA_BIN || isPolicyPath(entry.name))) throw new Error(`Archive entry is outside the managed REXP format: ${entry.name}`);
    const collisionKey = policyPathCollisionKey(entry.name);
    if (seen.has(collisionKey)) throw new Error(`Duplicate or colliding managed archive entry: ${entry.name}`);
    seen.add(collisionKey);
  }
}

function readRegularFile(path: string, label: string): Buffer {
  return readBoundedRegularFileNoFollow(resolve(path), { label, maxBytes: MAX_REXP_TOTAL_UNCOMPRESSED_BYTES });
}

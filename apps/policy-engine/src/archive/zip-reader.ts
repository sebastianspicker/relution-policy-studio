/** Reads single-disk ZIP files while preserving central-directory order. */
import { readCentralDirectory, type ZipReadLimits } from "./zip-central-directory.js";
import { readEndOfCentralDirectory } from "./zip-end-record.js";
import { type CentralDirectoryEntry, type ReadZipOptions, type ZipEntry } from "./zip-format.js";
import { readLocalRecord } from "./zip-local-record.js";
import { maximumExceededError } from "./zip-limit-error.js";

const DEFAULT_MAX_ENTRIES = 10000;
const DEFAULT_MAX_TOTAL_COMPRESSED_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;

export function readZip(buffer: Buffer, options: ReadZipOptions = {}): ZipEntry[] {
  const limits = readZipLimits(options);
  const strictLayout = options.strictLayout === true;
  const end = readEndOfCentralDirectory(buffer);
  if (strictLayout && end.commentLength !== 0) throw new Error("ZIP archive comments are not supported");
  if (end.totalEntries > limits.maxEntries) throw maximumExceededError("ZIP archive contains too many entries", end.totalEntries, limits.maxEntries);
  const centralEnd = end.centralDirectoryOffset + end.centralDirectorySize;
  assertCentralDirectoryBounds(centralEnd, end.offset);
  const centralEntries = readCentralDirectory(buffer, end.centralDirectoryOffset, centralEnd, end.totalEntries, limits, strictLayout);
  return decodeEntriesByLocalOffset(buffer, centralEntries, end.centralDirectoryOffset, strictLayout);
}

function assertCentralDirectoryBounds(centralEnd: number, endOffset: number): void {
  if (centralEnd !== endOffset) throw new Error("ZIP central directory must end at the end-of-central-directory record");
}

function decodeEntriesByLocalOffset(buffer: Buffer, centralEntries: CentralDirectoryEntry[], centralOffset: number, strictLayout: boolean): ZipEntry[] {
  const decoded = new Map<CentralDirectoryEntry, ZipEntry>();
  let expectedOffset = 0;
  for (const entry of [...centralEntries].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset)) {
    const record = readLocalRecord(buffer, entry, centralOffset, expectedOffset, strictLayout);
    decoded.set(entry, record.entry);
    expectedOffset = record.nextLocalOffset;
  }
  if (strictLayout && expectedOffset !== centralOffset) throw new Error("ZIP local records are not contiguous before the central directory");
  return centralEntries.map((entry) => decoded.get(entry)!);
}

function readZipLimits(options: ReadZipOptions): ZipReadLimits {
  return { maxEntries: normalizeLimit(options.maxEntries, DEFAULT_MAX_ENTRIES, "maxEntries"), maxTotalCompressedBytes: normalizeLimit(options.maxTotalCompressedBytes, DEFAULT_MAX_TOTAL_COMPRESSED_BYTES, "maxTotalCompressedBytes"), maxTotalUncompressedBytes: normalizeLimit(options.maxTotalUncompressedBytes, DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES, "maxTotalUncompressedBytes") };
}

function normalizeLimit(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`ZIP option ${label} must be a positive safe integer`);
  return value;
}

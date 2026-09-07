/** Parses bounded central-directory metadata before local records are decoded. */
import {
  CENTRAL_DIRECTORY_HEADER_SIZE,
  CENTRAL_DIRECTORY_SIGNATURE,
  type CentralDirectoryEntry,
  decodeZipEntryName,
  ZIP64_MARKER_16,
  ZIP64_MARKER_32,
} from "./zip-format.js";

export interface ZipReadLimits {
  maxEntries: number;
  maxTotalCompressedBytes: number;
  maxTotalUncompressedBytes: number;
}

export function readCentralDirectory(
  buffer: Buffer,
  offset: number,
  declaredEnd: number,
  totalEntries: number,
  limits: ZipReadLimits,
  strictLayout: boolean,
): CentralDirectoryEntry[] {
  const entries: CentralDirectoryEntry[] = [];
  let cursor = offset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    const parsed = readCentralEntry(buffer, cursor, declaredEnd, strictLayout);
    totalCompressedBytes = assertAggregateLimit(totalCompressedBytes + parsed.entry.compressedSize, limits.maxTotalCompressedBytes, "compressed");
    totalUncompressedBytes = assertAggregateLimit(totalUncompressedBytes + parsed.entry.uncompressedSize, limits.maxTotalUncompressedBytes, "uncompressed");
    entries.push(parsed.entry);
    cursor = parsed.end;
  }
  if (cursor !== declaredEnd) throw new Error("ZIP central directory size does not match its entries");
  return entries;
}

function readCentralEntry(buffer: Buffer, cursor: number, declaredEnd: number, strictLayout: boolean): { entry: CentralDirectoryEntry; end: number } {
  assertCentralBoundary(cursor + CENTRAL_DIRECTORY_HEADER_SIZE, declaredEnd, cursor, "header");
  assertCentralSignature(buffer, cursor);
  const nameLength = buffer.readUInt16LE(cursor + 28);
  const extraLength = buffer.readUInt16LE(cursor + 30);
  const commentLength = buffer.readUInt16LE(cursor + 32);
  const end = cursor + CENTRAL_DIRECTORY_HEADER_SIZE + nameLength + extraLength + commentLength;
  assertCentralBoundary(end, declaredEnd, cursor, "entry");
  if (strictLayout && extraLength !== 0) throw new Error("ZIP central directory extra fields are not supported");
  if (strictLayout && commentLength !== 0) throw new Error("ZIP central directory entry comments are not supported");
  const nameStart = cursor + CENTRAL_DIRECTORY_HEADER_SIZE;
  const nameBytes = Buffer.from(buffer.subarray(nameStart, nameStart + nameLength));
  const flags = buffer.readUInt16LE(cursor + 8);
  const compressedSize = buffer.readUInt32LE(cursor + 20);
  const uncompressedSize = buffer.readUInt32LE(cursor + 24);
  const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
  rejectCentralZip64Markers(compressedSize, uncompressedSize, localHeaderOffset, buffer.readUInt16LE(cursor + 34));
  return { end, entry: { name: decodeZipEntryName(nameBytes, flags), nameBytes, flags, compressionMethod: buffer.readUInt16LE(cursor + 10), crc: buffer.readUInt32LE(cursor + 16), compressedSize, uncompressedSize, localHeaderOffset } };
}

function assertCentralBoundary(end: number, declaredEnd: number, cursor: number, recordKind: "header" | "entry"): void {
  if (end <= declaredEnd) return;
  throw new Error(`Truncated ZIP central directory ${recordKind} at offset ${cursor}`);
}

function assertCentralSignature(buffer: Buffer, cursor: number): void {
  if (buffer.readUInt32LE(cursor) === CENTRAL_DIRECTORY_SIGNATURE) return;
  throw new Error(`Invalid ZIP central directory header at offset ${cursor}`);
}

function rejectCentralZip64Markers(compressedSize: number, uncompressedSize: number, offset: number, diskStart: number): void {
  if (compressedSize === ZIP64_MARKER_32 || uncompressedSize === ZIP64_MARKER_32 || offset === ZIP64_MARKER_32 || diskStart === ZIP64_MARKER_16) {
    throw new Error("ZIP64 archive entries are not supported");
  }
  if (diskStart !== 0) throw new Error("Multi-disk ZIP archive entries are not supported");
}

function assertAggregateLimit(total: number, limit: number, kind: "compressed" | "uncompressed"): number {
  if (total > limit) throw new Error(`ZIP archive ${kind} data exceeds the supported size limit (${String(limit)} bytes)`);
  return total;
}

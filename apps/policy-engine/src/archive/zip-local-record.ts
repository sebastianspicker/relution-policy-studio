/** Decodes local ZIP records and validates their central-directory metadata. */
import { crc32, decompressEntry } from "./zip-codec.js";
import { dataDescriptorEnd } from "./zip-data-descriptor.js";
import {
  DATA_DESCRIPTOR_FLAG,
  decodeZipEntryName,
  ENCRYPTED_FLAG,
  LOCAL_FILE_HEADER_SIGNATURE,
  LOCAL_FILE_HEADER_SIZE,
  type CentralDirectoryEntry,
  type ZipEntry,
  ZIP64_MARKER_32,
} from "./zip-format.js";

interface LocalHeader {
  nameStart: number;
  nameEnd: number;
  extraLength: number;
}

interface LocalRecord {
  entry: ZipEntry;
  nextLocalOffset: number;
}

export function readLocalRecord(
  buffer: Buffer,
  entry: CentralDirectoryEntry,
  centralDirectoryOffset: number,
  expectedLocalOffset: number,
  strictLayout: boolean,
): LocalRecord {
  assertLocalRecordPlacement(entry, centralDirectoryOffset, expectedLocalOffset, strictLayout);
  const header = readLocalHeader(buffer, entry, centralDirectoryOffset, strictLayout);
  const dataStart = header.nameEnd + header.extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > centralDirectoryOffset) throw new Error(`Truncated ZIP entry data for ${entry.name}`);
  assertMatchingLocalName(buffer.subarray(header.nameStart, header.nameEnd), entry);
  const data = decompressEntry(entry.name, entry.compressionMethod, buffer.subarray(dataStart, dataEnd), entry.uncompressedSize);
  if (crc32(data) !== entry.crc) throw new Error(`ZIP entry ${entry.name} failed CRC verification`);
  return { entry: { name: entry.name, data, compressionMethod: entry.compressionMethod }, nextLocalOffset: nextRecordOffset(buffer, entry, dataEnd, centralDirectoryOffset) };
}

function assertLocalRecordPlacement(entry: CentralDirectoryEntry, centralDirectoryOffset: number, expectedLocalOffset: number, strictLayout: boolean): void {
  if ((entry.flags & ENCRYPTED_FLAG) !== 0) throw new Error(`ZIP entry is encrypted: ${entry.name}`);
  if (strictLayout ? entry.localHeaderOffset !== expectedLocalOffset : entry.localHeaderOffset < expectedLocalOffset) {
    throw new Error(strictLayout ? `ZIP local records are not contiguous before the central directory at ${entry.name}` : `ZIP local records overlap before the central directory at ${entry.name}`);
  }
  assertBeforeCentralDirectory(entry.localHeaderOffset + LOCAL_FILE_HEADER_SIZE, centralDirectoryOffset, entry.name);
}

function readLocalHeader(buffer: Buffer, entry: CentralDirectoryEntry, centralDirectoryOffset: number, strictLayout: boolean): LocalHeader {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) throw new Error(`Invalid ZIP local file header for ${entry.name}`);
  const flags = buffer.readUInt16LE(offset + 6);
  const method = buffer.readUInt16LE(offset + 8);
  const crc = buffer.readUInt32LE(offset + 14);
  const compressedSize = buffer.readUInt32LE(offset + 18);
  const uncompressedSize = buffer.readUInt32LE(offset + 22);
  if (compressedSize === ZIP64_MARKER_32 || uncompressedSize === ZIP64_MARKER_32) throw new Error(`ZIP64 local entry markers are not supported for ${entry.name}`);
  const expected = entry;
  if (flags !== expected.flags || method !== expected.compressionMethod) throw new Error(`ZIP entry ${expected.name} has inconsistent local and central headers`);
  if ((flags & DATA_DESCRIPTOR_FLAG) === 0 && (crc !== expected.crc || compressedSize !== expected.compressedSize || uncompressedSize !== expected.uncompressedSize)) throw new Error(`ZIP entry ${expected.name} has inconsistent CRC or size headers`);
  const nameStart = offset + LOCAL_FILE_HEADER_SIZE;
  const nameEnd = nameStart + buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  assertBeforeCentralDirectory(nameEnd + extraLength, centralDirectoryOffset, entry.name);
  if (strictLayout && extraLength !== 0) throw new Error(`ZIP local extra fields are not supported for ${entry.name}`);
  return { nameStart, nameEnd, extraLength };
}

function assertBeforeCentralDirectory(end: number, centralDirectoryOffset: number, name: string): void {
  if (end <= centralDirectoryOffset) return;
  throw new Error(`Truncated ZIP local file header for ${name}`);
}

function assertMatchingLocalName(localName: Buffer, entry: CentralDirectoryEntry): void {
  const { flags, name, nameBytes } = entry;
  decodeZipEntryName(localName, flags);
  if (!localName.equals(nameBytes)) throw new Error(`ZIP entry ${name} has inconsistent local and central filenames`);
}

function nextRecordOffset(buffer: Buffer, entry: CentralDirectoryEntry, dataEnd: number, centralDirectoryOffset: number): number {
  return (entry.flags & DATA_DESCRIPTOR_FLAG) === 0 ? dataEnd : dataDescriptorEnd(buffer, entry, dataEnd, centralDirectoryOffset);
}

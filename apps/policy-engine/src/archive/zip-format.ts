/** ZIP record constants, public types, and lossless entry-name validation. */
import { TextDecoder } from "node:util";
export interface ZipEntry {
  name: string;
  data: Buffer;
  compressionMethod: number;
}

export interface ZipEntryInput {
  name: string;
  data: Buffer;
}

export interface ReadZipOptions {
  maxEntries?: number;
  maxTotalCompressedBytes?: number;
  maxTotalUncompressedBytes?: number;
  /** Require a contiguous local-record region and no ZIP comments or extra fields. */
  strictLayout?: boolean;
}

export interface CentralDirectoryEntry {
  name: string;
  nameBytes: Buffer;
  compressionMethod: number;
  flags: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export const EOCD_SIGNATURE = 0x06054b50;
export const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
export const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
export const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
export const ZIP64_MARKER_16 = 0xffff;
export const ZIP64_MARKER_32 = 0xffffffff;
export const UTF8_FLAG = 0x0800;
export const ENCRYPTED_FLAG = 0x0001;
export const DATA_DESCRIPTOR_FLAG = 0x0008;
export const METHOD_STORED = 0;
export const METHOD_DEFLATED = 8;
export const LOCAL_FILE_HEADER_SIZE = 30;
export const CENTRAL_DIRECTORY_HEADER_SIZE = 46;
export const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
export const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;

export function encodeZipEntryName(name: string): Buffer {
  const bytes = Buffer.from(name, "utf8");
  if (bytes.toString("utf8") !== name) {
    throw new Error("ZIP entry name is not losslessly UTF-8 encodable");
  }
  assertUInt16(bytes.length, "ZIP entry name length");
  return bytes;
}

export function decodeZipEntryName(nameBytes: Buffer, flags: number): string {
  const name = decodeUtf8(nameBytes);
  if ((flags & UTF8_FLAG) === 0 && /[^\x00-\x7f]/u.test(name)) {
    throw new Error(`ZIP entry name is not UTF-8 encoded: ${name}`);
  }
  return name;
}

function decodeUtf8(nameBytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
  } catch {
    throw new Error("ZIP entry name is not valid UTF-8");
  }
}

export function assertUInt16(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP64_MARKER_16 - 1) {
    throw new Error(`${label} exceeds ZIP's 16-bit limit`);
  }
}

export function assertUInt32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP64_MARKER_32 - 1) {
    throw new Error(`${label} exceeds ZIP's 32-bit limit`);
  }
}

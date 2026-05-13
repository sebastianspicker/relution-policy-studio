import { deflateRawSync, inflateRawSync } from "node:zlib";

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
}

interface CentralDirectoryEntry {
  name: string;
  compressionMethod: number;
  flags: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
const MAX_ENTRY_SIZE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 10000;
const DEFAULT_MAX_TOTAL_COMPRESSED_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const LOCAL_FILE_HEADER_SIZE = 30; // ZIP APPNOTE local file header, excluding variable name/extra fields.
const CENTRAL_DIRECTORY_HEADER_SIZE = 46; // ZIP APPNOTE central directory file header, excluding variable fields.
const END_OF_CENTRAL_DIRECTORY_SIZE = 22; // ZIP APPNOTE end of central directory record, excluding comment.
const CRC_TABLE = buildCrcTable();

export function readZip(buffer: Buffer, options: ReadZipOptions = {}): ZipEntry[] {
  const limits = readZipLimits(options);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (totalEntries === ZIP64_MARKER_16 || centralDirectoryOffset === ZIP64_MARKER_32) {
    throw new Error("ZIP64 archives are not supported");
  }
  if (totalEntries > limits.maxEntries) {
    throw new Error(`ZIP archive contains too many entries (${String(totalEntries)} > ${String(limits.maxEntries)})`);
  }

  const centralEntries = readCentralDirectory(buffer, centralDirectoryOffset, totalEntries, limits);
  return centralEntries.map((entry) => readEntryData(buffer, entry));
}

export function writeZip(entries: ZipEntryInput[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const localOffset = offset;
    const localHeader = createLocalHeader(nameBuffer, crc, compressed.length, entry.data.length);

    localChunks.push(localHeader, nameBuffer, compressed);
    offset += localHeader.length + nameBuffer.length + compressed.length;

    const centralHeader = createCentralDirectoryHeader(
      nameBuffer,
      crc,
      compressed.length,
      entry.data.length,
      localOffset,
    );
    centralChunks.push(centralHeader, nameBuffer);
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralChunks);
  const centralDirectorySize = centralDirectory.length;
  const eocd = createEndOfCentralDirectory(entries.length, centralDirectorySize, centralDirectoryOffset);

  return Buffer.concat([...localChunks, centralDirectory, eocd]);
}

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    const tableIndex = (crc ^ byte) & 0xff;
    crc = CRC_TABLE[tableIndex]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) {
      continue;
    }

    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) {
      return offset;
    }
  }

  throw new Error("Could not find ZIP end of central directory");
}

function readCentralDirectory(
  buffer: Buffer,
  offset: number,
  totalEntries: number,
  limits: Required<ReadZipOptions>,
): CentralDirectoryEntry[] {
  const entries: CentralDirectoryEntry[] = [];
  let cursor = offset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Invalid ZIP central directory header at offset ${cursor}`);
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    totalCompressedBytes += compressedSize;
    totalUncompressedBytes += uncompressedSize;
    if (totalCompressedBytes > limits.maxTotalCompressedBytes) {
      throw new Error(
        `ZIP archive compressed data exceeds the supported size limit (${String(limits.maxTotalCompressedBytes)} bytes)`,
      );
    }
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new Error(
        `ZIP archive uncompressed data exceeds the supported size limit (${String(limits.maxTotalUncompressedBytes)} bytes)`,
      );
    }

    entries.push({ name, compressionMethod, flags, compressedSize, uncompressedSize, localHeaderOffset });
    cursor = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipLimits(options: ReadZipOptions): Required<ReadZipOptions> {
  return {
    maxEntries: normalizeLimit(options.maxEntries, DEFAULT_MAX_ENTRIES, "maxEntries"),
    maxTotalCompressedBytes: normalizeLimit(
      options.maxTotalCompressedBytes,
      DEFAULT_MAX_TOTAL_COMPRESSED_BYTES,
      "maxTotalCompressedBytes",
    ),
    maxTotalUncompressedBytes: normalizeLimit(
      options.maxTotalUncompressedBytes,
      DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES,
      "maxTotalUncompressedBytes",
    ),
  };
}

function normalizeLimit(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`ZIP option ${label} must be a positive safe integer`);
  }
  return value;
}

function readEntryData(buffer: Buffer, entry: CentralDirectoryEntry): ZipEntry {
  if ((entry.flags & ENCRYPTED_FLAG) !== 0) {
    throw new Error(`ZIP entry is encrypted: ${entry.name}`);
  }
  if ((entry.flags & UTF8_FLAG) === 0 && /[^\x00-\x7f]/.test(entry.name)) {
    throw new Error(`ZIP entry name is not UTF-8 encoded: ${entry.name}`);
  }
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Invalid ZIP local file header for ${entry.name}`);
  }

  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedData = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  const data = decompressEntry(entry.name, entry.compressionMethod, compressedData, entry.uncompressedSize);

  return {
    name: entry.name,
    data,
    compressionMethod: entry.compressionMethod,
  };
}

function decompressEntry(name: string, compressionMethod: number, compressedData: Buffer, uncompressedSize: number): Buffer {
  if (uncompressedSize > MAX_ENTRY_SIZE_BYTES) {
    throw new Error(`ZIP entry ${name} exceeds the supported size limit (${String(MAX_ENTRY_SIZE_BYTES)} bytes)`);
  }
  if (compressionMethod === METHOD_STORED) {
    if (compressedData.length !== uncompressedSize) {
      throw new Error(`ZIP entry ${name} has an unexpected stored size`);
    }
    return Buffer.from(compressedData);
  }
  if (compressionMethod === METHOD_DEFLATED) {
    const data = inflateRawSync(compressedData, { maxOutputLength: uncompressedSize });
    if (data.length !== uncompressedSize) {
      throw new Error(`ZIP entry ${name} has an unexpected inflated size`);
    }
    return data;
  }
  throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${name}`);
}

function createLocalHeader(
  nameBuffer: Buffer,
  crc: number,
  compressedSize: number,
  uncompressedSize: number,
): Buffer {
  const header = Buffer.alloc(LOCAL_FILE_HEADER_SIZE);
  header.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(METHOD_DEFLATED, 8);
  writeDosDateTime(header, 10);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(uncompressedSize, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function createCentralDirectoryHeader(
  nameBuffer: Buffer,
  crc: number,
  compressedSize: number,
  uncompressedSize: number,
  localHeaderOffset: number,
): Buffer {
  const header = Buffer.alloc(CENTRAL_DIRECTORY_HEADER_SIZE);
  header.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(METHOD_DEFLATED, 10);
  writeDosDateTime(header, 12);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(uncompressedSize, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(localHeaderOffset, 42);
  return header;
}

function createEndOfCentralDirectory(
  totalEntries: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Buffer {
  const eocd = Buffer.alloc(END_OF_CENTRAL_DIRECTORY_SIZE);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(totalEntries, 8);
  eocd.writeUInt16LE(totalEntries, 10);
  eocd.writeUInt32LE(centralDirectorySize, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return eocd;
}

function writeDosDateTime(buffer: Buffer, offset: number): void {
  buffer.writeUInt16LE(0, offset);
  buffer.writeUInt16LE((1 << 5) | 1, offset + 2);
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

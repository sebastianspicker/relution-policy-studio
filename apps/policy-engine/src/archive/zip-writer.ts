/** Writes the bounded UTF-8, deflated ZIP layout used for REXP output. */
import { compressEntry, crc32 } from "./zip-codec.js";
import {
  assertUInt16,
  assertUInt32,
  CENTRAL_DIRECTORY_HEADER_SIZE,
  CENTRAL_DIRECTORY_SIGNATURE,
  encodeZipEntryName,
  END_OF_CENTRAL_DIRECTORY_SIZE,
  EOCD_SIGNATURE,
  LOCAL_FILE_HEADER_SIZE,
  LOCAL_FILE_HEADER_SIGNATURE,
  type ZipEntryInput,
  UTF8_FLAG,
  METHOD_DEFLATED,
} from "./zip-format.js";

interface WrittenEntry {
  name: Buffer;
  data: Buffer;
  compressed: Buffer;
  crc: number;
  offset: number;
}

export function writeZip(entries: ZipEntryInput[]): Buffer {
  assertUInt16(entries.length, "ZIP entry count");
  const written = prepareEntries(entries);
  const localChunks = written.flatMap((entry) => [createLocalHeader(entry), entry.name, entry.compressed]);
  const centralOffset = localByteLength(written);
  const centralChunks = written.flatMap((entry) => [createCentralDirectoryHeader(entry), entry.name]);
  const centralSize = byteLength(centralChunks);
  assertUInt32(centralOffset, "ZIP central-directory offset");
  assertUInt32(centralSize, "ZIP central-directory size");
  return Buffer.concat([...localChunks, ...centralChunks, createEndRecord(entries.length, centralSize, centralOffset)]);
}

function prepareEntries(entries: ZipEntryInput[]): WrittenEntry[] {
  const written: WrittenEntry[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encodeZipEntryName(entry.name);
    assertUInt32(entry.data.length, `ZIP entry uncompressed size for ${entry.name}`);
    const compressed = compressEntry(entry.data);
    assertUInt32(compressed.length, `ZIP entry compressed size for ${entry.name}`);
    assertUInt32(offset, `ZIP local-header offset for ${entry.name}`);
    written.push({ name, data: entry.data, compressed, crc: crc32(entry.data), offset });
    offset += LOCAL_FILE_HEADER_SIZE + name.length + compressed.length;
    assertUInt32(offset, "ZIP local-record region size");
  }
  return written;
}

function createLocalHeader(entry: WrittenEntry): Buffer {
  const header = Buffer.alloc(LOCAL_FILE_HEADER_SIZE);
  header.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(METHOD_DEFLATED, 8);
  writeDosDateTime(header, 10);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressed.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(entry.name.length, 26);
  return header;
}

function createCentralDirectoryHeader(entry: WrittenEntry): Buffer {
  const header = Buffer.alloc(CENTRAL_DIRECTORY_HEADER_SIZE);
  header.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(METHOD_DEFLATED, 10);
  writeDosDateTime(header, 12);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressed.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt32LE(entry.offset, 42);
  return header;
}

function createEndRecord(totalEntries: number, centralSize: number, centralOffset: number): Buffer {
  const end = Buffer.alloc(END_OF_CENTRAL_DIRECTORY_SIZE);
  end.writeUInt32LE(EOCD_SIGNATURE, 0);
  end.writeUInt16LE(totalEntries, 8);
  end.writeUInt16LE(totalEntries, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return end;
}

function localByteLength(entries: WrittenEntry[]): number {
  return entries.reduce((total, entry) => total + LOCAL_FILE_HEADER_SIZE + entry.name.length + entry.compressed.length, 0);
}

function byteLength(chunks: Buffer[]): number {
  return chunks.reduce((total, chunk) => total + chunk.length, 0);
}

function writeDosDateTime(buffer: Buffer, offset: number): void {
  buffer.writeUInt16LE(0, offset);
  buffer.writeUInt16LE((1 << 5) | 1, offset + 2);
}

/** ZIP compression, output-size, and CRC validation. */
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES, METHOD_DEFLATED, METHOD_STORED } from "./zip-format.js";

const CRC_TABLE = buildCrcTable();

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function compressEntry(data: Buffer): Buffer {
  return deflateRawSync(data);
}

export function decompressEntry(name: string, method: number, compressedData: Buffer, expectedSize: number): Buffer {
  if (expectedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) throw new Error(`ZIP entry ${name} exceeds the supported size limit (${String(MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES)} bytes)`);
  if (method === METHOD_STORED) return assertExpectedSize(name, Buffer.from(compressedData), expectedSize, "stored");
  if (method === METHOD_DEFLATED) return inflateDeflatedEntry(name, compressedData, expectedSize);
  throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
}

function inflateDeflatedEntry(name: string, compressedData: Buffer, expectedSize: number): Buffer {
  const result = inflateRawSync(compressedData, { info: true, maxOutputLength: Math.max(1, expectedSize) }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
  if (result.engine.bytesWritten !== compressedData.length) throw new Error(`ZIP entry ${name} contains trailing compressed data`);
  return assertExpectedSize(name, result.buffer, expectedSize, "inflated");
}

function assertExpectedSize(name: string, data: Buffer, expectedSize: number, kind: "stored" | "inflated"): Buffer {
  if (data.length !== expectedSize) throw new Error(`ZIP entry ${name} has an unexpected ${kind} size`);
  return data;
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

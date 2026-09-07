/** Validates classic signed and signatureless ZIP data descriptors. */
import { DATA_DESCRIPTOR_SIGNATURE, type CentralDirectoryEntry } from "./zip-format.js";

export function dataDescriptorEnd(buffer: Buffer, entry: CentralDirectoryEntry, start: number, centralDirectoryOffset: number): number {
  if (start + 12 > centralDirectoryOffset) throw new Error(`Truncated ZIP data descriptor for ${entry.name}`);
  const offsets = buffer.readUInt32LE(start) === DATA_DESCRIPTOR_SIGNATURE ? [start + 4, start] : [start];
  for (const offset of offsets) {
    if (offset + 12 <= centralDirectoryOffset && descriptorMatches(buffer, offset, entry)) return offset + 12;
  }
  throw new Error(`ZIP entry ${entry.name} has an inconsistent data descriptor`);
}

function descriptorMatches(buffer: Buffer, offset: number, entry: CentralDirectoryEntry): boolean {
  return buffer.readUInt32LE(offset) === entry.crc && buffer.readUInt32LE(offset + 4) === entry.compressedSize && buffer.readUInt32LE(offset + 8) === entry.uncompressedSize;
}

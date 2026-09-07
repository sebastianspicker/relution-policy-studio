/** Locates and validates the ZIP end-of-central-directory record. */
import { END_OF_CENTRAL_DIRECTORY_SIZE, EOCD_SIGNATURE, ZIP64_MARKER_16, ZIP64_MARKER_32 } from "./zip-format.js";

export interface EndOfCentralDirectory {
  offset: number;
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  totalEntries: number;
  commentLength: number;
}

export function readEndOfCentralDirectory(buffer: Buffer): EndOfCentralDirectory {
  const offset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(offset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(offset + 6);
  const entriesOnDisk = buffer.readUInt16LE(offset + 8);
  const totalEntries = buffer.readUInt16LE(offset + 10);
  const centralDirectorySize = buffer.readUInt32LE(offset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(offset + 16);
  const commentLength = buffer.readUInt16LE(offset + 20);
  rejectZip64Markers(entriesOnDisk, totalEntries, centralDirectorySize, centralDirectoryOffset);
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new Error("Multi-disk ZIP archives are not supported");
  }
  return { offset, centralDirectoryOffset, centralDirectorySize, totalEntries, commentLength };
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < END_OF_CENTRAL_DIRECTORY_SIZE) throw new Error("Could not find ZIP end of central directory");
  const minimumOffset = Math.max(0, buffer.length - END_OF_CENTRAL_DIRECTORY_SIZE - ZIP64_MARKER_16);
  for (let offset = buffer.length - END_OF_CENTRAL_DIRECTORY_SIZE; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE && isTerminalEndRecord(buffer, offset)) return offset;
  }
  throw new Error("Could not find ZIP end of central directory");
}

function isTerminalEndRecord(buffer: Buffer, offset: number): boolean {
  return offset + END_OF_CENTRAL_DIRECTORY_SIZE + buffer.readUInt16LE(offset + 20) === buffer.length;
}

function rejectZip64Markers(entriesOnDisk: number, totalEntries: number, size: number, offset: number): void {
  if (entriesOnDisk === ZIP64_MARKER_16 || totalEntries === ZIP64_MARKER_16 || size === ZIP64_MARKER_32 || offset === ZIP64_MARKER_32) {
    throw new Error("ZIP64 archives are not supported");
  }
}

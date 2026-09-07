import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  opendirSync,
  openSync,
  readSync,
} from "node:fs";
import { resolve } from "node:path";

const MAX_POLICY_JSON_BYTES = 10 * 1024 * 1024;

/** Read a bounded regular file without following symlinks or accepting concurrent truncation. */
export function readUtf8File(path) {
  const fd = openSync(resolve(path), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`Not a regular file: ${path}`);
    }
    if (stat.size > MAX_POLICY_JSON_BYTES) {
      throw new Error(`Policy JSON is too large: ${path}`);
    }
    const data = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < data.length) {
      const bytesRead = readSync(fd, data, offset, data.length - offset, offset);
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }
    if (offset !== data.length) {
      throw new Error(`Policy JSON changed while reading: ${path}`);
    }
    return data.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/** Enumerate directory entry names while ensuring the directory handle is always closed. */
export function listDirectoryNames(path) {
  const dir = opendirSync(resolve(path));
  const names = [];
  try {
    let entry = dir.readSync();
    while (entry !== null) {
      names.push(entry.name);
      entry = dir.readSync();
    }
  } finally {
    dir.closeSync();
  }
  return names;
}

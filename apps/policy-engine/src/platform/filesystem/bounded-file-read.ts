/** Reads regular files through a byte cap to limit resource consumption. */
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

export interface BoundedRegularFileReadOptions {
  label: string;
  maxBytes: number;
}

/**
 * Open and validate a regular file without following its final path component,
 * then synchronously consume it before closing the same descriptor.
 */
function withRegularFileNoFollow(
  path: string,
  options: BoundedRegularFileReadOptions,
  consume: (descriptor: number, size: number) => Buffer,
): Buffer {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const size = checkedRegularFileSize(descriptor, path, options);
    return consume(descriptor, size);
  } finally {
    closeSync(descriptor);
  }
}

/** Read a bounded regular file through a no-follow descriptor. */
export function readBoundedRegularFileNoFollow(path: string, options: BoundedRegularFileReadOptions): Buffer {
  return withRegularFileNoFollow(path, options, (descriptor, size) => {
    const data = Buffer.alloc(size);
    let offset = 0;
    while (offset < data.length) {
      const bytesRead = readSync(descriptor, data, offset, data.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== data.length) {
      throw new Error(`${options.label} changed while reading: ${path}`);
    }
    return data;
  });
}

function checkedRegularFileSize(descriptor: number, path: string, options: BoundedRegularFileReadOptions): number {
  const stats = fstatSync(descriptor);
  if (!stats.isFile()) {
    throw new Error(`${options.label} must be a regular file: ${path}`);
  }
  if (stats.size > options.maxBytes) {
    throw new Error(`${options.label} exceeds the ${String(options.maxBytes)} byte limit: ${path}`);
  }
  return stats.size;
}

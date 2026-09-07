/** Provides deterministic serialization and file inventory for generated MDM artifacts. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { MdmGeneratedFile } from "./mdm-types.js";

export function writeGenerated(
  root: string,
  path: string,
  value: unknown,
  kind: MdmGeneratedFile["kind"],
  files: MdmGeneratedFile[],
): void {
  const serialized = `${JSON.stringify(sortJson(value), null, 2)}\n`;
  writeStableText(resolve(root, path), serialized);
  files.push({ path, sha256: sha256(serialized), kind });
}

export function writeStableJson(path: string, value: unknown): void {
  writeStableText(path, `${JSON.stringify(sortJson(value), null, 2)}\n`);
}

export function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableUuid(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 32).toUpperCase();
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-A${hash.slice(17, 20)}-${hash.slice(20)}`;
}

export function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

function writeStableText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

/** Canonical JSON helpers for assurance artifact linkage and JSON-pointer values. */
import { createHash } from "node:crypto";
import { asRecord, type JsonRecord } from "../platform/serialization/json-guards.js";

export function assuranceCanonicalDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function assuranceValueAtPointer(value: unknown, pointer: string): unknown {
  return pointerSegments(pointer).reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) return isArrayIndex(segment) ? current[Number(segment)] : undefined;
    const record = asRecord(current);
    return record !== undefined && Object.hasOwn(record, segment) ? record[segment] : undefined;
  }, value);
}

export function assuranceSetValueAtPointer(record: JsonRecord, pointer: string, value: unknown): void {
  const segments = pointerSegments(pointer);
  let current: JsonRecord | unknown[] = record;
  for (const [index, segment] of segments.slice(0, -1).entries()) {
    const nextSegment = segments[index + 1]!;
    const child = readContainerChild(current, segment);
    if (Array.isArray(child) || asRecord(child) !== undefined) current = child as JsonRecord | unknown[];
    else {
      const created: JsonRecord | unknown[] = isArrayIndex(nextSegment) ? [] : {};
      writeContainerChild(current, segment, created);
      current = created;
    }
  }
  writeContainerChild(current, segments.at(-1)!, structuredClone(value));
}

export function isAssurancePointer(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.length < 2) return false;
  try {
    return pointerSegments(value).every((segment) => segment.length > 0);
  } catch {
    return false;
  }
}

function pointerSegments(pointer: string): string[] {
  if (!pointer.startsWith("/") || pointer.length < 2) throw new Error(`Invalid assurance value path: ${pointer}`);
  return pointer.slice(1).split("/").map((segment) => {
    if (/~(?:[^01]|$)/u.test(segment)) throw new Error(`Invalid assurance value path: ${pointer}`);
    const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (decoded === "__proto__" || decoded === "constructor" || decoded === "prototype") {
      throw new Error(`Unsafe assurance value path: ${pointer}`);
    }
    return decoded;
  });
}

function readContainerChild(container: JsonRecord | unknown[], segment: string): unknown {
  if (Array.isArray(container)) return isArrayIndex(segment) ? container[Number(segment)] : undefined;
  return Object.hasOwn(container, segment) ? container[segment] : undefined;
}

function writeContainerChild(container: JsonRecord | unknown[], segment: string, value: unknown): void {
  if (Array.isArray(container)) {
    if (!isArrayIndex(segment)) throw new Error(`Expected an array index in assurance value path: ${segment}`);
    container[Number(segment)] = value;
  } else {
    container[segment] = value;
  }
}

function isArrayIndex(segment: string): boolean {
  return /^(?:0|[1-9][0-9]*)$/u.test(segment) && Number.isSafeInteger(Number(segment));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Assurance values must be JSON serializable");
  return serialized;
}

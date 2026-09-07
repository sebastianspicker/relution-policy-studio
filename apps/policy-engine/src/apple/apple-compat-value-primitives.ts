/** Provides small, shared conversion primitives for Apple compatibility fields. */
import type { JsonRecord } from "./apple-compat-types.js";

export function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function firstEntry(record: JsonRecord | undefined): readonly [string | undefined, unknown] {
  return record === undefined ? [undefined, undefined] : Object.entries(record)[0] ?? [undefined, undefined];
}

export function listValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

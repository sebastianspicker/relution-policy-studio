/** Provides small runtime guards for untrusted JSON-shaped values. */
export type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

export { asRecord };

export function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as JsonRecord;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function uniqueStrings(values: Array<string | undefined>, options: { sort?: boolean } = {}): string[] {
  const unique = [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
  return options.sort === true ? unique.sort() : unique;
}

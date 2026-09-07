/** Parses and serializes scalar values shared by Apple profile editors. */

export type AppleProfileScalarValueKind = "string" | "textarea" | "boolean" | "integer" | "number" | "list" | "json";

export function parseAppleInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  const rawValue = String(value ?? "0").trim();
  if (!/^-?\d+$/u.test(rawValue)) return undefined;
  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseAppleFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseAppleJsonFieldValue(value: unknown, defaultValue: unknown): unknown {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? defaultValue);
  return JSON.parse(text.length === 0 ? "null" : text) as unknown;
}

export function appleScalarValueFromPayload(
  kind: AppleProfileScalarValueKind,
  value: unknown,
  defaultValue: unknown,
  listValue: (value: unknown) => string[],
): unknown {
  switch (kind) {
    case "boolean":
      return typeof value === "boolean" ? value : defaultValue;
    case "integer":
      return typeof value === "number" && Number.isInteger(value) ? value : defaultValue;
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
    case "list":
      return listValue(value);
    case "json":
      return JSON.stringify(value ?? defaultValue, null, 2);
    default:
      return typeof value === "string" ? value : String(value ?? "");
  }
}

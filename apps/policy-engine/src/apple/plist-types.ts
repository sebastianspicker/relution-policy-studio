/** Shared plist value and mobileconfig-inspection contracts. */
export type PlistValue = string | number | boolean | PlistDataValue | PlistValue[] | { [key: string]: PlistValue };

export interface PlistDataValue {
  kind: "data";
  base64: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPlistDataValue(value: unknown): value is PlistDataValue {
  return isRecord(value) && value.kind === "data" && typeof value.base64 === "string";
}

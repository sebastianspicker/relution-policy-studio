/** Parses plist dictionary key/value sequences without prototype inheritance. */
import type { JsonRecord } from "./editor-contracts.js";

export function parsePlistDict(element: Element, parseValue: (element: Element) => unknown): JsonRecord {
  const record: JsonRecord = Object.create(null) as JsonRecord;
  const children = Array.from(element.children);
  for (let index = 0; index < children.length; index += 2) {
    const key = children[index];
    const value = children[index + 1];
    if (key?.nodeName !== "key" || value === undefined) {
      throw new Error("Mobileconfig dict contains an invalid key/value sequence");
    }
    const name = key.textContent ?? "";
    if (Object.hasOwn(record, name)) throw new Error(`Mobileconfig dict contains a duplicate key: ${name}`);
    record[name] = parseValue(value);
  }
  return record;
}

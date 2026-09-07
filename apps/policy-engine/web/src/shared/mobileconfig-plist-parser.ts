/** Parses a mobileconfig XML document and requires a dictionary plist root. */
import { asRecord } from "./editor-record-utils.js";
import { parsePlistElement } from "./mobileconfig-plist-values.js";
import type { JsonRecord } from "./editor-contracts.js";

export function parseMobileConfig(rawContent: string): JsonRecord {
  const parser = new DOMParser();
  const document = parser.parseFromString(rawContent, "application/xml");
  if (document.querySelector("parsererror") !== null) throw new Error("Mobileconfig XML could not be parsed");
  const plist = document.documentElement;
  if (plist.nodeName !== "plist") throw new Error("Mobileconfig must be a plist document");
  const root = Array.from(plist.children)[0];
  if (root?.nodeName !== "dict") throw new Error("Mobileconfig plist root must be a dict");
  const record = asRecord(parsePlistElement(root));
  if (record === undefined) throw new Error("Mobileconfig plist root must parse to an object");
  return record;
}

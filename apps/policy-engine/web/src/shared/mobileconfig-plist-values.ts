/** Parses plist XML elements into prototype-free JSON-compatible values. */
import { parsePlistDict } from "./mobileconfig-plist-dict.js";
import { parsePlistInteger, parsePlistReal } from "./mobileconfig-plist-numbers.js";

export function parsePlistElement(element: Element): unknown {
  switch (element.nodeName) {
    case "dict": return parsePlistDict(element, parsePlistElement);
    case "array": return Array.from(element.children).map(parsePlistElement);
    case "integer": return parsePlistInteger(element.textContent ?? "0");
    case "real": return parsePlistReal(element.textContent ?? "0");
    case "true": return true;
    case "false": return false;
    case "string":
    case "data":
    case "date": return element.textContent ?? "";
    default: throw new Error(`Unsupported plist element: ${element.nodeName}`);
  }
}

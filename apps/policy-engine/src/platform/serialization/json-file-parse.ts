/** Reads and parses JSON in Node-only execution paths with safe error context. */
import { readFileSync } from "node:fs";
import { jsonContextError, parseJsonWithContext } from "./json-parse.js";

export function parseJsonFileWithContext(path: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw jsonContextError(label, error);
  }
  return parseJsonWithContext(text, label);
}

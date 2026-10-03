/** Matches the planner's sorted compact UTF-8 JSON snapshot representation. */
import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json-text.js";

export function canonicalJsonSha256(value: unknown): string {
  return createHash("sha256").update(`${canonicalJson(value)}\n`).digest("hex");
}

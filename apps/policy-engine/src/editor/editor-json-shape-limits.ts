/** Bounds JSON nesting and array width before parser-heavy editor routes run. */
import { HttpError } from "./editor-http-error.js";

const MAX_DEPTH = 200;
const MAX_ARRAY_ITEMS = 10_000;

type JsonContainer = { kind: "array" | "object"; itemCount: number; expectingValue: boolean };

export function assertJsonShapeWithinLimits(text: string): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  const containers: JsonContainer[] = [];
  for (const char of text) {
    if (inString) {
      ({ inString, escaped } = nextStringScannerState(char, escaped));
    } else if (char === "\"") {
      countArrayValueIfExpected(containers);
      inString = true;
    } else if (char === "{" || char === "[") {
      countArrayValueIfExpected(containers);
      depth = incrementJsonDepth(depth);
      containers.push({ kind: char === "[" ? "array" : "object", itemCount: 0, expectingValue: true });
    } else if (char === "}" || char === "]") {
      containers.pop();
      depth = Math.max(0, depth - 1);
    } else if (char === ",") {
      const current = containers.at(-1);
      if (current?.kind === "array") current.expectingValue = true;
    } else if (/\S/u.test(char)) {
      countArrayValueIfExpected(containers);
    }
  }
}

function nextStringScannerState(char: string, escaped: boolean): { inString: boolean; escaped: boolean } {
  if (escaped) return { inString: true, escaped: false };
  if (char === "\\") return { inString: true, escaped: true };
  return { inString: char !== "\"", escaped: false };
}

function incrementJsonDepth(depth: number): number {
  const nextDepth = depth + 1;
  if (nextDepth > MAX_DEPTH) {
    throw new HttpError(413, `JSON body exceeds maximum nesting depth ${String(MAX_DEPTH)}`);
  }
  return nextDepth;
}

function countArrayValueIfExpected(containers: JsonContainer[]): void {
  const current = containers.at(-1);
  if (current?.kind !== "array" || !current.expectingValue) return;
  current.itemCount += 1;
  current.expectingValue = false;
  if (current.itemCount > MAX_ARRAY_ITEMS) {
    throw new HttpError(413, `JSON array exceeds ${String(MAX_ARRAY_ITEMS)} items`);
  }
}

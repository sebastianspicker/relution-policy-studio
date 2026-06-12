import { statSync } from "node:fs";
import { inspectRexp } from "./rexp.js";

export interface EditorKeyValidationResponse {
  readonly keySet: boolean;
  readonly validated: boolean;
  readonly reason?: string;
}

export function validateEditorKeyForOutput(outputPath: string, key: string): EditorKeyValidationResponse {
  const keySet = key.length > 0;
  if (!keySet) {
    return { keySet, validated: false, reason: "No encryption key was provided." };
  }
  if (!isExistingFile(outputPath)) {
    return { keySet, validated: false, reason: "No built .rexp output is available to validate this key." };
  }
  try {
    inspectRexp(outputPath, key);
    return { keySet, validated: true };
  } catch {
    return { keySet, validated: false, reason: "Key does not decrypt the current output archive." };
  }
}

function isExistingFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

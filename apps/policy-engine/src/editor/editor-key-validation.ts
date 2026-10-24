/** Validates an editor archive passphrase against the current built output. */
import { statSync } from "node:fs";
import { inspectRexp } from "../archive/rexp-inspection.js";
import { newArchiveKeyProblem } from "../archive/rexp-key-policy.js";

export interface EditorKeyValidationResponse {
  readonly keySet: boolean;
  readonly validated: boolean;
  readonly reason?: string;
}

export function validateEditorKeyForOutput(outputPath: string, key: string): EditorKeyValidationResponse {
  const keySet = key.length > 0;
  if (!keySet) {
    return { keySet, validated: false, reason: "No archive passphrase was provided." };
  }
  // A key that opens the current output is validated even if it is too weak to build new archives.
  const problem = newArchiveKeyProblem(key);
  const policyReason = problem === undefined ? undefined : `It can open existing archives but cannot build new ones. ${problem}`;
  if (!isExistingFile(outputPath)) {
    return { keySet, validated: false, reason: policyReason ?? "No built .rexp output is available to validate this passphrase." };
  }
  try {
    inspectRexp(outputPath, key);
    return { keySet, validated: true };
  } catch {
    return { keySet, validated: false, reason: policyReason ?? "Passphrase does not decrypt the current output archive." };
  }
}

function isExistingFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

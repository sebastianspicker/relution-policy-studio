/** Supplies draft-bound identifiers and inherited policy dates before profile serialization. */
import { createHash } from "node:crypto";
import type { AppleProfileCreateOptions } from "../apple/apple-profile.js";

export function assuranceCreationOptions(seed: string, policyDate: unknown): AppleProfileCreateOptions {
  let sequence = 0;
  const date = typeof policyDate === "number" && Number.isFinite(policyDate) ? policyDate : 0;
  return { now: () => date, uuidFactory: () => {
    const hex = createHash("sha256").update(`${seed}:${String(sequence++)}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
  } };
}

/** Produces compact exact leaf changes after one assurance target application. */
import { isDeepStrictEqual } from "node:util";
import type { AssuranceChange, AssuranceMapping } from "./assurance-contracts.js";
import { asRecord } from "../platform/serialization/json-guards.js";

export function assuranceConfigurationChanges(
  before: readonly unknown[],
  after: readonly unknown[],
  mapping: AssuranceMapping,
  recommendationIds: readonly string[],
): AssuranceChange[] {
  const changes: AssuranceChange[] = [];
  collect(before, after, "", changes, mapping, recommendationIds);
  return changes;
}

function collect(
  before: unknown,
  after: unknown,
  path: string,
  changes: AssuranceChange[],
  mapping: AssuranceMapping,
  recommendationIds: readonly string[],
): void {
  if (isDeepStrictEqual(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
      collect(before[index], after[index], `${path}/${String(index)}`, changes, mapping, recommendationIds);
    }
    return;
  }
  const beforeRecord = asRecord(before);
  const afterRecord = asRecord(after);
  if ((beforeRecord !== undefined || before === undefined) && afterRecord !== undefined && Object.keys(afterRecord).length > 0) {
    const keys = [...new Set([...Object.keys(beforeRecord ?? {}), ...Object.keys(afterRecord)])].sort();
    for (const key of keys) collect(beforeRecord?.[key], afterRecord[key], `${path}/${escapePointer(key)}`, changes, mapping, recommendationIds);
    return;
  }
  changes.push({
    recommendationIds,
    family: mapping.family,
    target: mapping.target,
    path: `/configurations${path}`,
    ...(before === undefined ? {} : { before }),
    after,
  });
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

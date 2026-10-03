/** Evaluates explicit assurance applicability without inferring missing device context. */
import type {
  AssuranceApplicabilityContext,
  AssuranceApplicabilityPredicate,
  AssuranceRecommendation,
} from "./assurance-contracts.js";

export function assuranceApplicability(
  recommendation: AssuranceRecommendation,
  platform: string,
  context: AssuranceApplicabilityContext,
): { readonly applies: boolean; readonly reason?: string } {
  if ((recommendation.applicability.unresolvedRequirements?.length ?? 0) > 0) return {
    applies: false, reason: `Applicability is unresolved: ${recommendation.applicability.unresolvedRequirements!.join("; ")}`,
  };
  if (recommendation.applicability.predicates.length === 0) {
    return { applies: false, reason: "Applicability predicates are unresolved" };
  }
  for (const predicate of recommendation.applicability.predicates) {
    const actual = predicate.field === "platform" ? platform : context[predicate.field];
    if (actual === undefined) return { applies: false, reason: `Missing applicability context: ${predicate.field}` };
    if (!predicateMatches(predicate, actual)) {
      return { applies: false, reason: `Applicability predicate does not match: ${predicate.field} ${predicate.operator}` };
    }
  }
  return { applies: true };
}

function predicateMatches(predicate: AssuranceApplicabilityPredicate, actual: string): boolean {
  if (predicate.operator === "equals") return actual === predicate.value;
  if (predicate.operator === "oneOf") return Array.isArray(predicate.value) && predicate.value.includes(actual);
  if (typeof predicate.value !== "string") return false;
  const comparison = compareVersions(actual, predicate.value);
  return predicate.operator === "atLeast" ? comparison >= 0 : predicate.operator === "atMost" && comparison <= 0;
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === undefined || b === undefined) return Number.NaN;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseVersion(value: string): number[] | undefined {
  if (!/^[0-9]+(?:\.[0-9]+)*$/u.test(value)) return undefined;
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}

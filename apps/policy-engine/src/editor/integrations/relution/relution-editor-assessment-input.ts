/** Parses Relution assessment options without widening accepted input. */
import { badRequest } from "../../editor-http-error.js";
import { optionalNonNegativeInteger } from "../../editor-request-numbers.js";
import type { RelutionAssessmentOptions } from "../../../contracts/relution-assessment.js";

export function parseRelutionAssessmentOptions(body: Record<string, unknown>): RelutionAssessmentOptions {
  const expectedPoliciesByPlatform = optionalExpectedPolicies(body);
  const inactiveWarningDays = optionalNonNegativeInteger(body, "inactiveWarningDays");
  const inactiveProblemDays = optionalNonNegativeInteger(body, "inactiveProblemDays");
  if ((inactiveProblemDays ?? 90) < (inactiveWarningDays ?? 30)) {
    throw badRequest("inactiveProblemDays must be greater than or equal to inactiveWarningDays");
  }
  return {
    ...(expectedPoliciesByPlatform === undefined ? {} : { expectedPoliciesByPlatform }),
    ...(inactiveWarningDays === undefined ? {} : { inactiveWarningDays }),
    ...(inactiveProblemDays === undefined ? {} : { inactiveProblemDays }),
  };
}

function optionalExpectedPolicies(body: Record<string, unknown>): Record<string, string[]> | undefined {
  const value = body.expectedPoliciesByPlatform;
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw badRequest("Expected expectedPoliciesByPlatform object");
  const result = Object.create(null) as Record<string, string[]>;
  for (const [platform, policies] of Object.entries(value)) {
    if (!Array.isArray(policies) || !policies.every((policy) => typeof policy === "string")) throw badRequest(`Expected string array for expectedPoliciesByPlatform.${platform}`);
    result[platform] = policies;
  }
  return result;
}

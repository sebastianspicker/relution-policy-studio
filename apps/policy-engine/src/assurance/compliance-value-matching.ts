/** Applies exact and constrained recommendation mappings to actual values. */
import type { RecommendationRulesetMapping } from "./recommendation-types.js";
import type { JsonRecord } from "./compliance-types.js";
import { deepSubsetMatch } from "./compliance-deep-values.js";
import { comparableNumber } from "./compliance-number-values.js";
import { valueAtPath, withoutPaths } from "./compliance-value-paths.js";

type ValueConstraint = NonNullable<RecommendationRulesetMapping["constraints"]>[number];

export function mappingValuesMatch(mapping: RecommendationRulesetMapping, expectedValues: JsonRecord, actualValues: unknown): boolean {
  const constraints = mapping.constraints?.filter((constraint) => constraint.path.length > 0) ?? [];
  if (constraints.length === 0) return deepSubsetMatch(expectedValues, actualValues);
  const constrainedPaths = new Set(constraints.map((constraint) => constraint.path));
  return deepSubsetMatch(withoutPaths(expectedValues, constrainedPaths), actualValues)
    && constraints.every((constraint) => valueConstraintMatches(constraint, valueAtPath(actualValues, constraint.path)));
}

function valueConstraintMatches(constraint: ValueConstraint, actual: unknown): boolean {
  if (constraint.operator === "containsAll") return arrayContainsAll(actual, constraint.value);
  const actualNumber = comparableNumber(actual);
  const expectedNumber = comparableNumber(constraint.value);
  if (actualNumber === undefined || expectedNumber === undefined) return false;
  if (constraint.operator === "atLeast") return actualNumber >= expectedNumber;
  if (constraint.operator === "atMost") return actualNumber <= expectedNumber;
  return false;
}

function arrayContainsAll(actual: unknown, expected: unknown): boolean {
  return Array.isArray(actual)
    && Array.isArray(expected)
    && expected.every((expectedEntry) => actual.some((actualEntry) => deepSubsetMatch(expectedEntry, actualEntry)));
}

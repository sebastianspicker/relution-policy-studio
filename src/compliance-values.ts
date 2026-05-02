import type { RecommendationRulesetMapping, RecommendationSettingBundle, RecommendationSettingBundleCatalog } from "./recommendation-types.js";
import type { ComplianceConfigurationReference, JsonRecord } from "./compliance-types.js";

export function mappingValuesMatch(mapping: RecommendationRulesetMapping, expectedValues: JsonRecord, actualValues: unknown): boolean {
  const constraints = mapping.constraints?.filter((constraint) => constraint.path.length > 0) ?? [];
  if (constraints.length === 0) {
    return deepSubsetMatch(expectedValues, actualValues);
  }
  const constrainedPaths = new Set(constraints.map((constraint) => constraint.path));
  return deepSubsetMatch(withoutPaths(expectedValues, constrainedPaths), actualValues)
    && constraints.every((constraint) => valueConstraintMatches(constraint, valueAtPath(actualValues, constraint.path)));
}

function valueConstraintMatches(
  constraint: NonNullable<RecommendationRulesetMapping["constraints"]>[number],
  actual: unknown,
): boolean {
  if (constraint.operator === "containsAll") {
    return arrayContainsAll(actual, constraint.value);
  }
  const actualNumber = comparableNumber(actual);
  const expectedNumber = comparableNumber(constraint.value);
  if (actualNumber === undefined || expectedNumber === undefined) {
    return false;
  }
  if (constraint.operator === "atLeast") {
    return actualNumber >= expectedNumber;
  }
  if (constraint.operator === "atMost") {
    return actualNumber <= expectedNumber;
  }
  return false;
}

function arrayContainsAll(actual: unknown, expected: unknown): boolean {
  if (!Array.isArray(actual) || !Array.isArray(expected)) {
    return false;
  }
  return expected.every((expectedEntry) => actual.some((actualEntry) => deepSubsetMatch(expectedEntry, actualEntry)));
}

function comparableNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").filter((part) => part.length > 0).reduce<unknown>((current, part) => {
    const record = asRecord(current);
    return record?.[part];
  }, value);
}

function withoutPaths(value: unknown, paths: Set<string>, prefix = ""): unknown {
  if (paths.has(prefix)) {
    return undefined;
  }
  const record = asRecord(value);
  if (record === undefined) {
    return value;
  }
  const next: JsonRecord = {};
  for (const [key, child] of Object.entries(record)) {
    const childPath = prefix.length === 0 ? key : `${prefix}.${key}`;
    if (paths.has(childPath)) {
      continue;
    }
    const pruned = withoutPaths(child, paths, childPath);
    if (pruned !== undefined) {
      next[key] = pruned;
    }
  }
  return next;
}

export function deepSubsetMatch(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((entry, index) => deepSubsetMatch(entry, actual[index]));
  }
  const expectedRecord = asRecord(expected);
  if (expectedRecord !== undefined) {
    const actualRecord = asRecord(actual);
    return actualRecord !== undefined
      && Object.entries(expectedRecord).every(([key, value]) => deepSubsetMatch(value, actualRecord[key]));
  }
  return Object.is(expected, actual);
}

export function deepMergePreservingExistingUuids(existingValue: unknown, importedValue: unknown): JsonRecord {
  const existing = asRecord(existingValue) ?? {};
  const imported = asRecord(importedValue);
  if (imported === undefined) {
    return structuredClone(existing) as JsonRecord;
  }
  const merged = structuredClone(existing) as JsonRecord;
  for (const [key, value] of Object.entries(imported)) {
    if (key === "uuid" && typeof merged.uuid === "string" && merged.uuid.length > 0) {
      continue;
    }
    const existingChild = asRecord(merged[key]);
    const importedChild = asRecord(value);
    merged[key] = existingChild !== undefined && importedChild !== undefined
      ? deepMergePreservingExistingUuids(existingChild, importedChild)
      : structuredClone(value);
  }
  return merged;
}

export function mergeRecords(existing: JsonRecord, imported: JsonRecord): JsonRecord {
  return deepMergePreservingExistingUuids(existing, imported);
}

export function findSettingBundle(
  catalog: RecommendationSettingBundleCatalog | undefined,
  bundleId: string | undefined,
): RecommendationSettingBundle | undefined {
  if (catalog === undefined || bundleId === undefined) {
    return undefined;
  }
  return catalog.bundles.find((bundle) => bundle.bundleId === bundleId);
}

export function uniqueConfigurationReferences(references: ComplianceConfigurationReference[]): ComplianceConfigurationReference[] {
  const byIndex = new Map<number, ComplianceConfigurationReference>();
  for (const reference of references) {
    byIndex.set(reference.configurationIndex, reference);
  }
  return [...byIndex.values()].sort((left, right) => left.configurationIndex - right.configurationIndex);
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

export function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
}

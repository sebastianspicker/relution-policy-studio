/** Handles the nested system-migration payload shape. */
import type { JsonRecord } from "./apple-compat-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { stringValue } from "./apple-compat-value-primitives.js";

export function mergeSystemMigrationValuesIntoPayloadKeys(values: JsonRecord, payloadKeys: JsonRecord): JsonRecord {
  return {
    ...payloadKeys,
    CustomBehavior: [{
      Context: stringValue(values.migrationContext) ?? "Windows",
      Paths: [{
        SourcePath: stringValue(values.sourcePath) ?? "",
        SourcePathInUserHome: values.sourcePathInUserHome === true,
        TargetPath: stringValue(values.targetPath) ?? "",
        TargetPathInUserHome: values.targetPathInUserHome === true,
      }],
    }],
  };
}

export function hydrateSystemMigrationValues(values: JsonRecord, payloadKeys: JsonRecord): void {
  const behavior = firstSystemMigrationBehavior(payloadKeys);
  const path = firstSystemMigrationPath(behavior);
  values.migrationContext = fallbackString(behavior?.Context, values.migrationContext, "Windows");
  values.sourcePath = fallbackString(path?.SourcePath, values.sourcePath, "");
  values.sourcePathInUserHome = fallbackBoolean(path?.SourcePathInUserHome, values.sourcePathInUserHome);
  values.targetPath = fallbackString(path?.TargetPath, values.targetPath, "");
  values.targetPathInUserHome = fallbackBoolean(path?.TargetPathInUserHome, values.targetPathInUserHome);
}

function firstSystemMigrationBehavior(payloadKeys: JsonRecord): JsonRecord | undefined {
  return Array.isArray(payloadKeys.CustomBehavior) ? asRecord(payloadKeys.CustomBehavior[0]) : undefined;
}

function firstSystemMigrationPath(behavior: JsonRecord | undefined): JsonRecord | undefined {
  return Array.isArray(behavior?.Paths) ? asRecord(behavior?.Paths[0]) : undefined;
}

function fallbackString(value: unknown, previous: unknown, fallback: string): string {
  return stringValue(value) ?? stringValue(previous) ?? fallback;
}

function fallbackBoolean(value: unknown, previous: unknown): boolean {
  return typeof value === "boolean" ? value : previous === true;
}

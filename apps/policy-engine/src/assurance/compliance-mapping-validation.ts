/** Rejects incomplete legacy predicates before evaluation or mutation. */
import type { RecommendationRulesetMapping } from "./recommendation-types.js";
import { asRecord } from "../platform/serialization/json-guards.js";
import { comparableNumber } from "./compliance-number-values.js";

export function validCompliancePredicate(mapping: RecommendationRulesetMapping): boolean {
  const values = asRecord(mapping.values);
  if (values === undefined || !hasValue(values)) return false;
  if (mapping.constraints === undefined) return true;
  if (!Array.isArray(mapping.constraints) || mapping.constraints.length === 0) return false;
  return mapping.constraints.every((entry) => {
    const constraint = asRecord(entry);
    if (constraint === undefined || typeof constraint.path !== "string" || !validPath(constraint.path)) return false;
    if (constraint.operator === "containsAll") return Array.isArray(constraint.value) && constraint.value.length > 0;
    return (constraint.operator === "atLeast" || constraint.operator === "atMost") && comparableNumber(constraint.value) !== undefined;
  });
}

function hasValue(value: unknown): boolean {
  const record = asRecord(value);
  if (record === undefined) return value !== undefined;
  return Object.entries(record).some(([key, child]) => safeKey(key) && hasValue(child))
    && Object.entries(record).every(([key, child]) => safeKey(key) && safeValue(child));
}

function safeValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(safeValue);
  const record = asRecord(value);
  return record === undefined || Object.entries(record).every(([key, child]) => safeKey(key) && safeValue(child));
}

function validPath(path: string): boolean { return path.split(".").every((part) => part.length > 0 && safeKey(part)); }
function safeKey(key: string): boolean { return !["__proto__", "constructor", "prototype"].includes(key); }

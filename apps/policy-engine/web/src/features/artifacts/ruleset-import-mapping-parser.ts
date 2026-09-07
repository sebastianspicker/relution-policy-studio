import { asRecord } from "../../shared/editor-record-utils.js";
import type { Mapping } from "../../shared/ruleset-import-contracts.js";

export function parseRulesetMappings(input: unknown, ruleId: string): readonly Mapping[] {
  return Array.isArray(input) ? input.map((mapping, index) => parseMapping(mapping, ruleId, index)) : [];
}

function parseMapping(input: unknown, ruleId: string, index: number): Mapping {
  const record = asRecord(input);
  if (record === undefined || typeof record.kind !== "string") {
    throw new Error(`Mapping ${ruleId}.${index + 1} must include kind`);
  }
  const values = asRecord(record.values) ?? {};
  if (record.kind === "relution-native" && typeof record.type === "string") {
    return { kind: "relution-native", type: record.type, values };
  }
  if (record.kind === "apple-mobileconfig" && typeof record.payloadType === "string") {
    return { kind: "apple-mobileconfig", payloadType: record.payloadType, values };
  }
  if (record.kind === "apple-schema-profile" && typeof record.schemaId === "string") {
    return { kind: "apple-schema-profile", schemaId: record.schemaId, values };
  }
  throw new Error(`Mapping ${ruleId}.${index + 1} has invalid fields for kind ${record.kind}`);
}

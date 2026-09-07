import { asRecord } from "../../shared/editor-record-utils.js";
import { parseRulesetMappings } from "./ruleset-import-mapping-parser.js";
import type { RulesetPolicy, RulesetRule } from "../../shared/ruleset-import-contracts.js";

export function parseRuleset(input: unknown): { readonly name: string; readonly policies: readonly RulesetPolicy[] } {
  const record = asRecord(input);
  if (record === undefined || record.version !== 1 || typeof record.name !== "string" || !Array.isArray(record.policies)) {
    throw new Error("Ruleset JSON must include version 1, name, and policies");
  }
  return {
    name: record.name,
    policies: record.policies.map((policy, index) => parsePolicy(policy, index)),
  };
}

function parsePolicy(input: unknown, index: number): RulesetPolicy {
  const record = asRecord(input);
  if (record === undefined || typeof record.platform !== "string" || typeof record.name !== "string" || !Array.isArray(record.rules)) {
    throw new Error(`Ruleset policy ${index + 1} must include platform, name, and rules`);
  }
  return {
    platform: record.platform,
    name: record.name,
    ...(typeof record.description === "string" ? { description: record.description } : {}),
    rules: record.rules.map((rule, ruleIndex) => parseRule(rule, index, ruleIndex)),
  };
}

function parseRule(input: unknown, policyIndex: number, ruleIndex: number): RulesetRule {
  const record = asRecord(input);
  if (record === undefined || typeof record.id !== "string" || typeof record.title !== "string") {
    throw new Error(`Rule ${policyIndex + 1}.${ruleIndex + 1} must include id and title`);
  }
  const ruleId = record.id;
  return {
    id: ruleId,
    title: record.title,
    informational: record.informational === true,
    mappings: parseRulesetMappings(record.mappings, ruleId),
  };
}

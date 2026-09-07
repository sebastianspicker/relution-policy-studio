/** Validates baseline catalog indexes, template documents, rules, and mappings. */
import {
  isBaselineTemplatePlatform,
  isBaselineTemplateTier,
  type BaselineExpertMapping,
  type BaselineTemplateDocument,
  type BaselineTemplatePolicy,
  type BaselineTemplateRule,
  type BaselineTemplateSourceRule,
  type BaselineTemplateTier,
  type TemplateIndex,
  type TemplateIndexEntry,
} from "./baseline-template-model.js";
import {
  optionalRecord,
  optionalString,
  requireInteger,
  requireRecord,
  requireString,
} from "./baseline-template-json-validation.js";

export function parseBaselineTemplateDocument(input: unknown, tier: BaselineTemplateTier): BaselineTemplateDocument {
  const record = requireRecord(input, `tier ${String(tier)} baseline template`);
  const policies = record.policies;
  if (!Array.isArray(policies)) throw new Error(`Expected policies array in tier ${String(tier)} baseline template`);
  return {
    version: requireInteger(record.version, "version"),
    name: requireString(record, "name"),
    policies: policies.map((policy, index) => parseBaselineTemplatePolicy(policy, `${String(tier)}.${String(index + 1)}`)),
  };
}

function parseBaselineTemplatePolicy(input: unknown, label: string): BaselineTemplatePolicy {
  const record = requireRecord(input, `baseline policy ${label}`);
  const platform = requireString(record, "platform");
  const rules = record.rules;
  if (!isBaselineTemplatePlatform(platform)) throw new Error(`Invalid baseline policy platform: ${platform}`);
  if (!Array.isArray(rules)) throw new Error(`Expected rules array in baseline policy ${label}`);
  const description = optionalString(record, "description");
  return {
    platform,
    name: requireString(record, "name"),
    ...(description === undefined ? {} : { description }),
    rules: rules.map((rule, index) => parseBaselineTemplateRule(rule, `${label}.${String(index + 1)}`)),
  };
}

export function parseTemplateIndex(input: unknown): TemplateIndex {
  const record = requireRecord(input, "baseline template index");
  return {
    version: requireInteger(record.version, "version"),
    format: requireString(record, "format"),
    tieredConsolidatedTemplates: requireEntries(record, "tieredConsolidatedTemplates"),
    tieredModularBundleTemplates: requireEntries(record, "tieredModularBundleTemplates"),
  };
}

function requireEntries(record: Record<string, unknown>, key: string): TemplateIndexEntry[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`Expected ${key} array in baseline template index`);
  return value.map((entry, index) => normalizeEntry(entry, `${key}[${String(index)}]`));
}

function normalizeEntry(value: unknown, label: string): TemplateIndexEntry {
  const record = requireRecord(value, label);
  const tier = requireInteger(record.tier, "tier");
  const platform = requireString(record, "platform");
  if (!isBaselineTemplateTier(tier)) throw new Error(`Invalid tier in ${label}: ${String(tier)}`);
  if (!isBaselineTemplatePlatform(platform)) throw new Error(`Invalid platform in ${label}: ${platform}`);
  const tierLabel = optionalString(record, "tierLabel");
  const securityLevel = optionalString(record, "securityLevel");
  const tierSourcePolicy = optionalString(record, "tierSourcePolicy");
  const tierCoverage = optionalString(record, "tierCoverage");
  const suppressedConflictRuleCount = record.suppressedConflictRuleCount === undefined
    ? undefined
    : requireInteger(record.suppressedConflictRuleCount, "suppressedConflictRuleCount");
  return {
    path: requireString(record, "path"),
    platform,
    tier,
    policyCount: requireInteger(record.policyCount, "policyCount"),
    ruleCount: requireInteger(record.ruleCount, "ruleCount"),
    actionableRuleCount: requireInteger(record.actionableRuleCount, "actionableRuleCount"),
    informationalRuleCount: requireInteger(record.informationalRuleCount, "informationalRuleCount"),
    ...(tierLabel === undefined ? {} : { tierLabel }),
    ...(securityLevel === undefined ? {} : { securityLevel }),
    ...(tierSourcePolicy === undefined ? {} : { tierSourcePolicy }),
    ...(tierCoverage === undefined ? {} : { tierCoverage }),
    ...(suppressedConflictRuleCount === undefined ? {} : { suppressedConflictRuleCount }),
  };
}

function parseBaselineTemplateRule(input: unknown, label: string): BaselineTemplateRule {
  const record = requireRecord(input, `baseline rule ${label}`);
  const sourceIds = record.sourceIds;
  const sourceRules = record.sourceRules;
  const mappings = record.mappings;
  const reason = optionalString(record, "reason");
  return {
    id: requireString(record, "id"),
    title: requireString(record, "title"),
    informational: record.informational === true,
    ...(reason === undefined ? {} : { reason }),
    sourceIds: Array.isArray(sourceIds) ? sourceIds.filter((entry): entry is string => typeof entry === "string") : [],
    sourceRules: Array.isArray(sourceRules)
      ? sourceRules.map((entry, index) => parseSourceRule(entry, `${label}.${String(index + 1)}`))
      : [],
    mappings: Array.isArray(mappings)
      ? mappings.map((entry, index) => parseExpertMapping(entry, `${label}.${String(index + 1)}`))
      : [],
  };
}

function parseSourceRule(input: unknown, label: string): BaselineTemplateSourceRule {
  const record = requireRecord(input, `source rule ${label}`);
  return {
    source: requireString(record, "source"),
    ruleId: requireString(record, "ruleId"),
    title: requireString(record, "title"),
  };
}

function parseExpertMapping(input: unknown, label: string): BaselineExpertMapping {
  const record = requireRecord(input, `expert mapping ${label}`);
  const kind = requireString(record, "kind");
  const type = optionalString(record, "type");
  const payloadType = optionalString(record, "payloadType");
  const schemaId = optionalString(record, "schemaId");
  const values = optionalRecord(record, "values") ?? {};
  return {
    kind,
    target: mappingTarget(kind, type, payloadType, schemaId),
    ...(type === undefined ? {} : { type }),
    ...(payloadType === undefined ? {} : { payloadType }),
    ...(schemaId === undefined ? {} : { schemaId }),
    values,
  };
}

function mappingTarget(
  kind: string,
  type: string | undefined,
  payloadType: string | undefined,
  schemaId: string | undefined,
): string {
  if (kind === "relution-native" && type !== undefined) return type;
  if (kind === "apple-mobileconfig" && payloadType !== undefined) return payloadType;
  if (kind === "apple-schema-profile" && schemaId !== undefined) return schemaId;
  throw new Error(`Mapping has invalid fields for kind ${kind}`);
}

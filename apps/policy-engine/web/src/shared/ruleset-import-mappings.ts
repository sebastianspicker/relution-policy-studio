// Supports editor ruleset-import parsing and mapping.
import { appleCompatSettingsForPlatform, createAppleCompatConfiguration } from "../../../src/browser/apple.js";
import {
  appleSchemaEntriesForPlatform,
  createAppleSchemaProfileConfiguration,
  findAppleSchemaEntry,
} from "../../../src/browser/apple.js";
import type { JsonRecord } from "./editor-contracts.js";
import type { ImportContext, Mapping, RulesetImportReport, RulesetPolicy, RulesetRule } from "./ruleset-import-contracts.js";

const BUILT_IN_MAPPINGS: Record<string, readonly Mapping[]> = {
  "bsi-ios-disable-camera": [{ kind: "relution-native", type: "IOS_RESTRICTION", values: { allowCamera: false } }],
  "bsi-macos-passcode": [{ kind: "relution-native", type: "IOS_PASSCODE", values: { forcePIN: true, minLength: 8 } }],
  "bsi-android-disable-camera": [{ kind: "relution-native", type: "ANDROID_ENTERPRISE_DISABLE_CAMERAS", values: { cameraDisabled: true } }],
};

export function hasBuiltInRulesetMapping(ruleId: string): boolean {
  return builtInRulesetMappings(ruleId).length > 0;
}

export function builtInRulesetMappings(ruleId: string): readonly Mapping[] {
  return BUILT_IN_MAPPINGS[ruleId.toLowerCase()] ?? [];
}

export function configurationFromMapping(
  policy: RulesetPolicy,
  rule: RulesetRule,
  mapping: Mapping,
  context: ImportContext,
  report: RulesetImportReport,
  seenSingleTypes: Set<string>,
): JsonRecord | undefined {
  if (mapping.kind === "relution-native") {
    return nativeConfiguration(policy, rule, mapping, context, report, seenSingleTypes);
  }
  if (mapping.kind === "apple-mobileconfig") {
    return appleMobileconfig(policy, rule, mapping, report, seenSingleTypes);
  }
  return appleSchemaProfile(policy, rule, mapping, context, report, seenSingleTypes);
}

function nativeConfiguration(
  policy: RulesetPolicy,
  rule: RulesetRule,
  mapping: Extract<Mapping, { kind: "relution-native" }>,
  context: ImportContext,
  report: RulesetImportReport,
  seenSingleTypes: Set<string>,
): JsonRecord | undefined {
  const template = context.templatesByType.get(mapping.type);
  if (template === undefined || !template.platforms.includes(policy.platform)) {
    reportUnavailableMapping(policy, rule, `Relution type ${mapping.type}`, report);
    return undefined;
  }
  if (!registerConfigurationType(policy, rule, mapping.type, template.multiConfig, seenSingleTypes, report)) {
    return undefined;
  }
  report.applied.push({ policyName: policy.name, ruleId: rule.id, kind: mapping.kind, target: mapping.type });
  return createConfigurationEnvelope({ enabled: true, ...mapping.values, type: mapping.type }, context);
}

function appleMobileconfig(
  policy: RulesetPolicy,
  rule: RulesetRule,
  mapping: Extract<Mapping, { kind: "apple-mobileconfig" }>,
  report: RulesetImportReport,
  seenSingleTypes: Set<string>,
): JsonRecord | undefined {
  const setting = appleCompatSettingsForPlatform(policy.platform).find(
    (candidate) => candidate.id === mapping.payloadType || candidate.payloadType === mapping.payloadType,
  );
  if (setting === undefined) {
    reportUnavailableMapping(policy, rule, `Apple mobileconfig payload ${mapping.payloadType}`, report);
    return undefined;
  }
  return applyAppleMobileconfigMapping(policy, rule, mapping, setting.payloadType, report, seenSingleTypes, () =>
    createAppleCompatConfiguration(setting.id, mapping.values),
  );
}

function appleSchemaProfile(
  policy: RulesetPolicy,
  rule: RulesetRule,
  mapping: Extract<Mapping, { kind: "apple-schema-profile" }>,
  context: ImportContext,
  report: RulesetImportReport,
  seenSingleTypes: Set<string>,
): JsonRecord | undefined {
  const entry = findAppleSchemaEntry(context.appleSchema, mapping.schemaId);
  const available = appleSchemaEntriesForPlatform(context.appleSchema, policy.platform, "profile");
  if (entry === undefined || entry.kind !== "profile" || !available.some((candidate) => candidate.id === entry.id)) {
    reportUnavailableMapping(policy, rule, `Apple schema profile ${mapping.schemaId}`, report);
    return undefined;
  }
  return applyAppleMobileconfigMapping(policy, rule, mapping, entry.identifier, report, seenSingleTypes, () =>
    createAppleSchemaProfileConfiguration(entry, mapping.values),
  );
}

function reportUnavailableMapping(policy: RulesetPolicy, rule: RulesetRule, target: string, report: RulesetImportReport): void {
  report.conflicts.push(`${policy.name}/${rule.id}: ${target} is not available for ${policy.platform}`);
}

function applyAppleMobileconfigMapping(
  policy: RulesetPolicy,
  rule: RulesetRule,
  mapping: Extract<Mapping, { kind: "apple-mobileconfig" | "apple-schema-profile" }>,
  target: string,
  report: RulesetImportReport,
  seenSingleTypes: Set<string>,
  createConfiguration: () => JsonRecord,
): JsonRecord | undefined {
  if (!registerConfigurationType(policy, rule, "APPLE_MOBILECONFIG", true, seenSingleTypes, report)) {
    return undefined;
  }
  report.applied.push({ policyName: policy.name, ruleId: rule.id, kind: mapping.kind, target });
  return createConfiguration();
}

function registerConfigurationType(
  policy: RulesetPolicy,
  rule: RulesetRule,
  type: string,
  multiConfig: boolean,
  seenSingleTypes: Set<string>,
  report: RulesetImportReport,
): boolean {
  if (!multiConfig && seenSingleTypes.has(type)) {
    report.conflicts.push(`${policy.name}/${rule.id}: ${type} is not multi-config and was mapped more than once`);
    return false;
  }
  if (!multiConfig) {
    seenSingleTypes.add(type);
  }
  return true;
}

function createConfigurationEnvelope(details: JsonRecord, context: ImportContext): JsonRecord {
  const detailsUuid = typeof details.uuid === "string" && details.uuid.length > 0 ? details.uuid : context.uuidFactory();
  return {
    uuid: context.uuidFactory(),
    createdBy: "local",
    creationDate: context.now,
    modifiedBy: "local",
    modificationDate: context.now,
    details: { ...details, uuid: detailsUuid },
  };
}

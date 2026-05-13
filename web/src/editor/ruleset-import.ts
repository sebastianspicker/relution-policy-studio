import { appleCompatSettingsForPlatform, createAppleCompatConfiguration } from "../../../src/apple-compat.js";
import {
  appleSchemaEntriesForPlatform,
  createAppleSchemaProfileConfiguration,
  findAppleSchemaEntry,
  type AppleSchemaCatalog,
} from "../../../src/apple-schema.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../../../src/templates.js";
import type { PolicyWorkspace } from "../../../src/workspace.js";
import { asRecord, newBrowserUuid } from "./editor-utils.js";
import type { JsonRecord } from "./types.js";

export interface RulesetImportReport {
  applied: RulesetAppliedMapping[];
  unresolved: RulesetUnresolvedRule[];
  conflicts: string[];
  warnings: string[];
}

export interface RulesetImportResult {
  workspace?: PolicyWorkspace;
  report: RulesetImportReport;
}

export interface RulesetImportOptions {
  now?: number;
  uuidFactory?: () => string;
}

type Mapping =
  | { readonly kind: "relution-native"; readonly type: string; readonly values: JsonRecord }
  | { readonly kind: "apple-mobileconfig"; readonly payloadType: string; readonly values: JsonRecord }
  | { readonly kind: "apple-schema-profile"; readonly schemaId: string; readonly values: JsonRecord };

type RulesetPolicy = {
  readonly platform: string;
  readonly name: string;
  readonly description?: string;
  readonly rules: readonly RulesetRule[];
};

type RulesetRule = {
  readonly id: string;
  readonly title: string;
  readonly informational: boolean;
  readonly mappings: readonly Mapping[];
};

type RulesetAppliedMapping = {
  readonly policyName: string;
  readonly ruleId: string;
  readonly kind: Mapping["kind"];
  readonly target: string;
};

type RulesetUnresolvedRule = {
  readonly policyName: string;
  readonly ruleId: string;
  readonly title: string;
  readonly suggestions: readonly string[];
};

type ImportContext = {
  readonly bundle: RelutionTemplateBundle;
  readonly appleSchema: AppleSchemaCatalog;
  readonly now: number;
  readonly uuidFactory: () => string;
  readonly templatesByType: ReadonlyMap<string, ConfigurationTemplate>;
};

const BUILT_IN_MAPPINGS: Record<string, readonly Mapping[]> = {
  "bsi-ios-disable-camera": [{ kind: "relution-native", type: "IOS_RESTRICTION", values: { allowCamera: false } }],
  "bsi-macos-passcode": [{ kind: "relution-native", type: "IOS_PASSCODE", values: { forcePIN: true, minLength: 8 } }],
  "bsi-android-disable-camera": [{ kind: "relution-native", type: "ANDROID_ENTERPRISE_DISABLE_CAMERAS", values: { cameraDisabled: true } }],
};

export function importRulesetWorkspace(
  input: unknown,
  bundle: RelutionTemplateBundle,
  appleSchema: AppleSchemaCatalog,
  options: RulesetImportOptions = {},
): RulesetImportResult {
  const ruleset = parseRuleset(input);
  const context: ImportContext = {
    bundle,
    appleSchema,
    now: options.now ?? Date.now(),
    uuidFactory: options.uuidFactory ?? newBrowserUuid,
    templatesByType: new Map(bundle.configurationTypes.map((template) => [template.type, template])),
  };
  const report: RulesetImportReport = { applied: [], unresolved: [], conflicts: [], warnings: [] };
  const policies = ruleset.policies.map((policy) => createPolicy(policy, context, report));
  if (report.conflicts.length > 0 || report.unresolved.length > 0) {
    return { report };
  }
  const workspace: PolicyWorkspace = {
    metadata: createWorkspaceMetadata(bundle.serverVersion),
    report: createExportReport(policies),
    policies: policies.map((policy) => ({ path: policy.path, document: policy.document })),
  };
  return { workspace, report };
}

function parseRuleset(input: unknown): { readonly name: string; readonly policies: readonly RulesetPolicy[] } {
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
    mappings: Array.isArray(record.mappings) ? record.mappings.map((mapping, index) => parseMapping(mapping, ruleId, index)) : [],
  };
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

function createPolicy(policy: RulesetPolicy, context: ImportContext, report: RulesetImportReport): { uuid: string; path: string; document: JsonRecord } {
  const policyUuid = context.uuidFactory();
  const versionUuid = context.uuidFactory();
  const configurations: JsonRecord[] = [];
  const seenSingleTypes = new Set<string>();
  for (const rule of policy.rules) {
    const mappings = rule.mappings.length > 0 ? rule.mappings : BUILT_IN_MAPPINGS[rule.id.toLowerCase()] ?? [];
    if (mappings.length === 0) {
      if (!rule.informational) {
        report.unresolved.push({ policyName: policy.name, ruleId: rule.id, title: rule.title, suggestions: suggestions(rule, policy.platform, context) });
      }
      continue;
    }
    for (const mapping of mappings) {
      const configuration = configurationFromMapping(policy, rule, mapping, context, report, seenSingleTypes);
      if (configuration !== undefined) {
        configurations.push(configuration);
      }
    }
  }
  return {
    uuid: policyUuid,
    path: `policies/policy_${policyUuid}.json`,
    document: {
      uuid: policyUuid,
      createdBy: "local",
      creationDate: context.now,
      modifiedBy: "local",
      modificationDate: context.now,
      organizationUuid: null,
      name: policy.name,
      description: policy.description ?? "",
      platform: policy.platform,
      payloadUuid: null,
      deletedBy: null,
      deletionDate: null,
      versions: [{
        uuid: versionUuid,
        createdBy: "local",
        creationDate: context.now,
        modifiedBy: "local",
        modificationDate: context.now,
        version: 1,
        state: "PUBLISHED",
        name: "Version 1",
        description: null,
        publisher: null,
        publishDate: null,
        configurations,
      }],
    },
  };
}

function configurationFromMapping(
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
    report.conflicts.push(`${policy.name}/${rule.id}: Relution type ${mapping.type} is not available for ${policy.platform}`);
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
    report.conflicts.push(`${policy.name}/${rule.id}: Apple mobileconfig payload ${mapping.payloadType} is not available for ${policy.platform}`);
    return undefined;
  }
  if (!registerConfigurationType(policy, rule, "APPLE_MOBILECONFIG", true, seenSingleTypes, report)) {
    return undefined;
  }
  report.applied.push({ policyName: policy.name, ruleId: rule.id, kind: mapping.kind, target: setting.payloadType });
  return createAppleCompatConfiguration(setting.id, mapping.values);
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
    report.conflicts.push(`${policy.name}/${rule.id}: Apple schema profile ${mapping.schemaId} is not available for ${policy.platform}`);
    return undefined;
  }
  if (!registerConfigurationType(policy, rule, "APPLE_MOBILECONFIG", true, seenSingleTypes, report)) {
    return undefined;
  }
  report.applied.push({ policyName: policy.name, ruleId: rule.id, kind: mapping.kind, target: entry.identifier });
  return createAppleSchemaProfileConfiguration(entry, mapping.values);
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

function suggestions(rule: RulesetRule, platform: string, context: ImportContext): string[] {
  const haystack = `${rule.id} ${rule.title}`.toLowerCase();
  const relution = context.bundle.configurationTypes
    .filter((template) => template.platforms.includes(platform) && tokens(template.label, template.type).some((token) => haystack.includes(token)))
    .slice(0, 5)
    .map((template) => `relution-native:${template.type}`);
  const apple = appleSchemaEntriesForPlatform(context.appleSchema, platform, "profile")
    .filter((entry) => tokens(entry.title, entry.identifier).some((token) => haystack.includes(token)))
    .slice(0, 5)
    .map((entry) => `apple-schema-profile:${entry.id}`);
  return [...relution, ...apple].slice(0, 8);
}

function tokens(...values: string[]): string[] {
  return values.join(" ").toLowerCase().split(/[^a-z0-9]+/u).filter((token) => token.length >= 4);
}

function createConfigurationEnvelope(details: JsonRecord, context: ImportContext): JsonRecord {
  if (typeof details.uuid !== "string" || details.uuid.length === 0) {
    details.uuid = context.uuidFactory();
  }
  return {
    uuid: context.uuidFactory(),
    createdBy: "local",
    creationDate: context.now,
    modifiedBy: "local",
    modificationDate: context.now,
    details,
  };
}

function createWorkspaceMetadata(serverVersion: string): JsonRecord {
  return {
    version: 1,
    type: "POLICY",
    serverVersion,
    cipherSpecVersion: 1,
    digestSpecVersion: 1,
    archiveFormatVersion: 1,
    fileFormatVersion: 1,
  };
}

function createExportReport(policies: readonly { readonly uuid: string; readonly document: JsonRecord }[]): JsonRecord {
  return {
    policiesToExport: policies.map((policy) => policy.uuid),
    exportedPolicies: Object.fromEntries(
      policies.map((policy) => [policy.uuid, { policyUuid: policy.uuid, policyName: String(policy.document.name ?? "Policy"), result: "SUCCESS", errors: [] }]),
    ),
    failedPolicies: {},
    exportFile: { uuid: null, name: null, contentType: null, size: 0, modificationDate: 0, properties: {}, hashcode: null, link: null },
  };
}

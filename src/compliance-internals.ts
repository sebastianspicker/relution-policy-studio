import {
  APPLE_COMPAT_SETTINGS,
  createAppleCompatConfiguration,
  extractAppleCompatValues,
  findAppleCompatSettingForDetails,
  updateAppleCompatDetails,
} from "./apple-compat.js";
import {
  createAppleSchemaProfileConfiguration,
  extractAppleSchemaValues,
  findAppleSchemaEntry,
  findAppleSchemaProfileForDetails,
  updateAppleSchemaProfileDetails,
  type AppleSchemaCatalog,
} from "./apple-schema.js";
import {
  type RecommendationImplementation,
  type RecommendationImplementationSurface,
  type RecommendationCatalogResponse,
  type RecommendationRecord,
  type RecommendationRulesetMapping,
  type RecommendationSettingBundle,
  type RecommendationSettingBundleCatalog,
  type RecommendationSource,
} from "./recommendation-types.js";
import { createConfiguration, type PolicyWorkspace } from "./workspace.js";
import { findTemplate, type RelutionTemplateBundle } from "./templates.js";
import type {
  ComplianceConfigurationReference,
  ComplianceMappingResult,
  ComplianceRecommendationResult,
  ComplianceRemediationOption,
  ComplianceSourceCatalogs,
  ComplianceStatus,
  ComplianceSelection,
  JsonRecord,
} from "./compliance-types.js";
import {
  asRecord,
  deepMergePreservingExistingUuids,
  deepSubsetMatch,
  mappingValuesMatch,
  uniqueConfigurationReferences,
  uniqueStrings,
} from "./compliance-values.js";

// Most Relution native configuration types are single-instance per policy
// version. Windows Custom CSP is different: each row is its own setting, and
// the CSP name is the domain identity used for matching and updates.
const MULTI_INSTANCE_NATIVE_TYPES = new Set(["WINDOWS_CUSTOM_CSP"]);

export function evaluateRecommendation(
  source: RecommendationSource,
  recommendation: RecommendationRecord,
  configurations: JsonRecord[],
  artifacts: ComplianceSourceCatalogs,
  bundle: RelutionTemplateBundle,
  appleSchema: AppleSchemaCatalog,
): ComplianceRecommendationResult {
  const mappings = recommendation.relutionMapping.status === "exact"
    ? recommendation.relutionMapping.rulesetMappings.filter(supportedComplianceMapping)
    : [];

  if (mappings.length === 0) {
    const parameterized = recommendation.relutionMapping.status === "parameterized";
    return {
      id: `${source}:${recommendation.id}`,
      source,
      recommendationId: recommendation.id,
      recommendation,
      status: parameterized ? "parameter-required" : "not-checkable",
      mappingResults: [],
      matchedConfigurations: [],
      blockingReasons: fallbackBlockingReasons(recommendation),
      remediationOptions: [],
    };
  }

  const mappingResults = mappings.map((mapping) => evaluateMapping(mapping, configurations, appleSchema));
  const matchedConfigurations = uniqueConfigurationReferences(mappingResults.flatMap((entry) => entry.matchingConfigurations));
  const allCompliant = mappingResults.every((entry) => entry.status === "compliant");
  const unsupported = mappingResults.some((entry) => entry.status === "unsupported");
  const ambiguous = mappingResults.some((entry) => entry.status === "ambiguous");
  const remediationOptions = allCompliant || unsupported
    ? []
    : remediationOptionsForRecommendation(source, recommendation, artifacts.settingBundleCatalog, mappingResults);

  let status: ComplianceStatus;
  if (allCompliant) {
    status = "compliant";
  } else if (unsupported) {
    status = "not-checkable";
  } else if (ambiguous || remediationOptions.length > 1) {
    status = "choice-required";
  } else {
    status = "exact-gap";
  }

  return {
    id: `${source}:${recommendation.id}`,
    source,
    recommendationId: recommendation.id,
    recommendation,
    status,
    mappingResults,
    matchedConfigurations,
    blockingReasons: blockingReasonsForResult(recommendation, mappingResults, remediationOptions, status),
    remediationOptions: status === "choice-required" && ambiguous ? [] : remediationOptions,
  };
}

function remediationOptionsForRecommendation(
  source: RecommendationSource,
  recommendation: RecommendationRecord,
  settingsCatalog: RecommendationSettingBundleCatalog | undefined,
  mappingResults: ComplianceMappingResult[],
): ComplianceRemediationOption[] {
  if (mappingResults.some((entry) => entry.status === "ambiguous")) {
    return [];
  }

  const bundles = settingsCatalog?.bundles.filter((bundle) => bundle.derivedFromRecommendationIds.includes(recommendation.id)) ?? [];
  if (bundles.length > 0) {
    const bundleById = new Map(bundles.map((bundle) => [bundle.bundleId, bundle]));
    const variantGroup = settingsCatalog?.variantGroups.find((group) => group.variants.some((variant) => bundleById.has(variant.bundleId)));
    if (variantGroup !== undefined) {
      return variantGroup.variants
        .map((variant) => bundleById.get(variant.bundleId))
        .filter((bundle): bundle is RecommendationSettingBundle => bundle !== undefined)
        .map((bundle) => nativeBundleOption(bundle, recommendation, bundle.variantId));
    }
    return bundles.map((bundle) => nativeBundleOption(bundle, recommendation, bundle.variantId));
  }

  return [recommendationOption(source, recommendation)];
}

function nativeBundleOption(
  bundle: RecommendationSettingBundle,
  recommendation: RecommendationRecord,
  variantId: string | undefined,
): ComplianceRemediationOption {
  return {
    id: `native-bundle:${bundle.bundleId}`,
    kind: "native-bundle",
    label: variantId === undefined
      ? `Apply ${bundle.targetType} exact bundle`
      : `Apply ${bundle.targetType} exact bundle (${variantId})`,
    surfaces: ["relution-native"],
    coveredRecommendationIds: bundle.derivedFromRecommendationIds,
    bundleId: bundle.bundleId,
    targetType: bundle.targetType,
    ...(variantId === undefined ? {} : { variantId }),
  };
}

function recommendationOption(
  source: RecommendationSource,
  recommendation: RecommendationRecord,
): ComplianceRemediationOption {
  const implementation = implementationOf(recommendation);
  return {
    id: `recommendation:${source}:${recommendation.id}`,
    kind: "exact-recommendation",
    label: `Apply exact mapping for ${recommendation.title}`,
    surfaces: implementation.surfaces,
    coveredRecommendationIds: [recommendation.id],
    ...mappingTargetMetadata(recommendation.relutionMapping.rulesetMappings[0]),
  };
}

function mappingTargetMetadata(mapping: RecommendationRulesetMapping | undefined): Pick<ComplianceRemediationOption, "schemaId" | "payloadType"> {
  if (mapping?.kind === "apple-schema-profile" && typeof mapping.schemaId === "string") {
    return { schemaId: mapping.schemaId };
  }
  if (mapping?.kind === "apple-mobileconfig" && typeof mapping.payloadType === "string") {
    return { payloadType: mapping.payloadType };
  }
  return {};
}

function evaluateMapping(
  mapping: RecommendationRulesetMapping,
  configurations: JsonRecord[],
  appleSchema: AppleSchemaCatalog,
): ComplianceMappingResult {
  const expectedValues = asRecord(mapping.values) ?? {};
  if (mapping.kind === "relution-native" && typeof mapping.type === "string") {
    return evaluateNativeMapping(mapping.type, mapping, expectedValues, configurations);
  }
  if (mapping.kind === "apple-schema-profile" && typeof mapping.schemaId === "string") {
    return evaluateAppleSchemaMapping(mapping.schemaId, mapping, expectedValues, configurations, appleSchema);
  }
  if (mapping.kind === "apple-mobileconfig" && typeof mapping.payloadType === "string") {
    return evaluateAppleCompatMapping(mapping.payloadType, mapping, expectedValues, configurations);
  }
  return {
    kind: mapping.kind,
    target: mapping.kind === "relution-native"
      ? String(mapping.type ?? "")
      : mapping.kind === "apple-schema-profile"
        ? String(mapping.schemaId ?? "")
        : String(mapping.payloadType ?? ""),
    expectedValues,
    status: "unsupported",
    matchingConfigurations: [],
    candidateConfigurations: [],
  };
}

function evaluateNativeMapping(
  type: string,
  mapping: RecommendationRulesetMapping,
  expectedValues: JsonRecord,
  configurations: JsonRecord[],
): ComplianceMappingResult {
  const candidates = configurationCandidates(configurations, (details) => details.type === type);
  const matching = candidates.filter((entry) => mappingValuesMatch(mapping, expectedValues, entry.details));
  const status = nativeMappingStatus(type, expectedValues, matching.length, candidates);
  return {
    kind: "relution-native",
    target: type,
    expectedValues,
    status,
    matchingConfigurations: matching.map((entry) => entry.reference),
    candidateConfigurations: candidates.map((entry) => entry.reference),
  };
}

function evaluateAppleSchemaMapping(
  schemaId: string,
  mapping: RecommendationRulesetMapping,
  expectedValues: JsonRecord,
  configurations: JsonRecord[],
  appleSchema: AppleSchemaCatalog,
): ComplianceMappingResult {
  const entry = findAppleSchemaEntry(appleSchema, schemaId);
  if (entry === undefined || entry.kind !== "profile") {
    return {
      kind: "apple-schema-profile",
      target: schemaId,
      expectedValues,
      status: "unsupported",
      matchingConfigurations: [],
      candidateConfigurations: [],
    };
  }
  const candidates = configurationCandidates(configurations, (details) => findAppleSchemaProfileForDetails(appleSchema, details)?.id === schemaId);
  const matching = candidates.filter((candidate) => mappingValuesMatch(mapping, expectedValues, extractAppleSchemaValues(candidate.details, entry)));
  return {
    kind: "apple-schema-profile",
    target: schemaId,
    expectedValues,
    status: determineMappingStatus(matching.length, candidates.length),
    matchingConfigurations: matching.map((entry) => entry.reference),
    candidateConfigurations: candidates.map((entry) => entry.reference),
  };
}

function evaluateAppleCompatMapping(
  payloadType: string,
  mapping: RecommendationRulesetMapping,
  expectedValues: JsonRecord,
  configurations: JsonRecord[],
): ComplianceMappingResult {
  const setting = APPLE_COMPAT_SETTINGS.find((candidate) => candidate.payloadType === payloadType);
  if (setting === undefined) {
    return {
      kind: "apple-mobileconfig",
      target: payloadType,
      expectedValues,
      status: "unsupported",
      matchingConfigurations: [],
      candidateConfigurations: [],
    };
  }
  const candidates = configurationCandidates(configurations, (details) => findAppleCompatSettingForDetails(details)?.id === setting.id);
  const matching = candidates.filter((candidate) => mappingValuesMatch(mapping, expectedValues, extractAppleCompatValues(candidate.details, setting)));
  return {
    kind: "apple-mobileconfig",
    target: payloadType,
    expectedValues,
    status: determineMappingStatus(matching.length, candidates.length),
    matchingConfigurations: matching.map((entry) => entry.reference),
    candidateConfigurations: candidates.map((entry) => entry.reference),
  };
}

function determineMappingStatus(matchingCount: number, candidateCount: number): ComplianceMappingResult["status"] {
  if (matchingCount > 0) {
    return "compliant";
  }
  if (candidateCount === 0) {
    return "missing";
  }
  return candidateCount === 1 ? "mismatch" : "ambiguous";
}

export function applyNativeBundle(configurations: JsonRecord[], bundle: RecommendationSettingBundle, templateBundle: RelutionTemplateBundle): void {
  applyNativeValues(configurations, bundle.targetType, asRecord(bundle.details) ?? {}, templateBundle);
}

export function applyRecommendationMappings(
  configurations: JsonRecord[],
  recommendation: RecommendationRecord,
  templateBundle: RelutionTemplateBundle,
  appleSchema: AppleSchemaCatalog,
): void {
  // A recommendation may contribute several mappings for the same target.
  // Merge them before applying so one remediation creates or updates a single
  // configuration per target instead of producing duplicate partial settings.
  const grouped = new Map<string, { mapping: RecommendationRulesetMapping; values: JsonRecord }>();
  for (const mapping of recommendation.relutionMapping.rulesetMappings.filter(supportedComplianceMapping)) {
    const key = mapping.kind === "relution-native"
      ? `relution-native:${mapping.type}`
      : mapping.kind === "apple-schema-profile"
        ? `apple-schema-profile:${mapping.schemaId}`
        : `apple-mobileconfig:${mapping.payloadType}`;
    const existing = grouped.get(key);
    const nextValues = deepMergePreservingExistingUuids(existing?.values ?? {}, asRecord(mapping.values) ?? {});
    grouped.set(key, { mapping, values: nextValues });
  }

  for (const { mapping, values } of grouped.values()) {
    if (mapping.kind === "relution-native" && typeof mapping.type === "string") {
      applyNativeValues(configurations, mapping.type, values, templateBundle);
      continue;
    }
    if (mapping.kind === "apple-schema-profile" && typeof mapping.schemaId === "string") {
      applyAppleSchemaValues(configurations, mapping.schemaId, values, appleSchema);
      continue;
    }
    if (mapping.kind === "apple-mobileconfig" && typeof mapping.payloadType === "string") {
      applyAppleCompatValues(configurations, mapping.payloadType, values);
      continue;
    }
    throw new Error(`Unsupported compliance mapping kind: ${mapping.kind}`);
  }
}

function applyNativeValues(
  configurations: JsonRecord[],
  targetType: string,
  values: JsonRecord,
  templateBundle: RelutionTemplateBundle,
): void {
  const candidates = configurationCandidates(configurations, (details) => details.type === targetType);
  const matching = candidates.filter((entry) => deepSubsetMatch(values, entry.details));
  if (matching.length > 0) {
    return;
  }
  const sameIdentity = candidatesWithSameNativeIdentity(targetType, values, candidates);
  if (sameIdentity.length > 1) {
    throw new Error(`Compliance apply is ambiguous for ${targetType}: multiple target settings share the same identity`);
  }
  if (sameIdentity.length === 1) {
    const onlyCandidate = sameIdentity[0]!;
    const candidate = configurations[onlyCandidate.reference.configurationIndex];
    const candidateRecord = asRecord(candidate);
    if (candidateRecord === undefined) {
      throw new Error(`Target configuration is invalid for ${targetType}`);
    }
    const details = asRecord(candidateRecord.details) ?? {};
    candidateRecord.details = deepMergePreservingExistingUuids(details, values);
    return;
  }
  if (MULTI_INSTANCE_NATIVE_TYPES.has(targetType)) {
    createNativeConfiguration(configurations, targetType, values, templateBundle);
    return;
  }
  if (candidates.length > 1) {
    throw new Error(`Compliance apply is ambiguous for ${targetType}: multiple target settings exist`);
  }
  if (candidates.length === 1) {
    const onlyCandidate = candidates[0]!;
    const candidate = configurations[onlyCandidate.reference.configurationIndex];
    const candidateRecord = asRecord(candidate);
    if (candidateRecord === undefined) {
      throw new Error(`Target configuration is invalid for ${targetType}`);
    }
    const details = asRecord(candidateRecord.details) ?? {};
    candidateRecord.details = deepMergePreservingExistingUuids(details, values);
    return;
  }

  createNativeConfiguration(configurations, targetType, values, templateBundle);
}

function createNativeConfiguration(
  configurations: JsonRecord[],
  targetType: string,
  values: JsonRecord,
  templateBundle: RelutionTemplateBundle,
): void {
  const template = findTemplate(templateBundle, targetType);
  if (template === undefined) {
    throw new Error(`Relution template not found for ${targetType}`);
  }
  const created = createConfiguration(template, templateBundle);
  const createdRecord = asRecord(created);
  if (createdRecord === undefined) {
    throw new Error(`Failed to create configuration for ${targetType}`);
  }
  createdRecord.details = deepMergePreservingExistingUuids(asRecord(createdRecord.details) ?? {}, values);
  configurations.push(createdRecord);
}

function nativeMappingStatus(
  type: string,
  expectedValues: JsonRecord,
  matchingCount: number,
  candidates: Array<{ details: JsonRecord; reference: ComplianceConfigurationReference }>,
): ComplianceMappingResult["status"] {
  if (matchingCount > 0) {
    return "compliant";
  }
  if (candidates.length === 0) {
    return "missing";
  }
  if (MULTI_INSTANCE_NATIVE_TYPES.has(type)) {
    const sameIdentity = candidatesWithSameNativeIdentity(type, expectedValues, candidates);
    if (sameIdentity.length === 0) {
      return "missing";
    }
    return sameIdentity.length === 1 ? "mismatch" : "ambiguous";
  }
  return candidates.length === 1 ? "mismatch" : "ambiguous";
}

function candidatesWithSameNativeIdentity(
  type: string,
  values: JsonRecord,
  candidates: Array<{ details: JsonRecord; reference: ComplianceConfigurationReference }>,
): Array<{ details: JsonRecord; reference: ComplianceConfigurationReference }> {
  if (type !== "WINDOWS_CUSTOM_CSP" || typeof values.name !== "string" || values.name.length === 0) {
    return [];
  }
  return candidates.filter((candidate) => candidate.details.name === values.name);
}

function applyAppleSchemaValues(
  configurations: JsonRecord[],
  schemaId: string,
  values: JsonRecord,
  appleSchema: AppleSchemaCatalog,
): void {
  const entry = findAppleSchemaEntry(appleSchema, schemaId);
  if (entry === undefined || entry.kind !== "profile") {
    throw new Error(`Apple schema profile not found: ${schemaId}`);
  }
  const candidates = configurationCandidates(configurations, (details) => findAppleSchemaProfileForDetails(appleSchema, details)?.id === schemaId);
  const matching = candidates.filter((candidate) => deepSubsetMatch(values, extractAppleSchemaValues(candidate.details, entry)));
  if (matching.length > 0) {
    return;
  }
  const candidateRecord = singleApplyCandidate(configurations, candidates, schemaId, "Apple schema configuration", "multiple matching Apple profiles exist");
  if (candidateRecord !== undefined) {
    const details = asRecord(candidateRecord.details) ?? {};
    const mergedValues = deepMergePreservingExistingUuids(extractAppleSchemaValues(details, entry), values);
    candidateRecord.details = updateAppleSchemaProfileDetails(details, entry, mergedValues);
    return;
  }
  configurations.push(createAppleSchemaProfileConfiguration(entry, values));
}

function applyAppleCompatValues(configurations: JsonRecord[], payloadType: string, values: JsonRecord): void {
  const setting = APPLE_COMPAT_SETTINGS.find((candidate) => candidate.payloadType === payloadType);
  if (setting === undefined) {
    throw new Error(`Apple mobileconfig payload type not found: ${payloadType}`);
  }
  const candidates = configurationCandidates(configurations, (details) => findAppleCompatSettingForDetails(details)?.id === setting.id);
  const matching = candidates.filter((candidate) => deepSubsetMatch(values, extractAppleCompatValues(candidate.details, setting)));
  if (matching.length > 0) {
    return;
  }
  const candidateRecord = singleApplyCandidate(configurations, candidates, payloadType, "Apple mobileconfig configuration", "multiple matching Apple settings exist");
  if (candidateRecord !== undefined) {
    const details = asRecord(candidateRecord.details) ?? {};
    const mergedValues = deepMergePreservingExistingUuids(extractAppleCompatValues(details, setting), values);
    candidateRecord.details = updateAppleCompatDetails(details, setting.id, mergedValues);
    return;
  }
  configurations.push(createAppleCompatConfiguration(setting.id, values));
}

function singleApplyCandidate(
  configurations: JsonRecord[],
  candidates: Array<{ details: JsonRecord; reference: ComplianceConfigurationReference }>,
  target: string,
  targetLabel: string,
  ambiguityReason: string,
): JsonRecord | undefined {
  if (candidates.length > 1) {
    throw new Error(`Compliance apply is ambiguous for ${target}: ${ambiguityReason}`);
  }
  const onlyCandidate = candidates[0];
  if (onlyCandidate === undefined) {
    return undefined;
  }
  const candidateRecord = asRecord(configurations[onlyCandidate.reference.configurationIndex]);
  if (candidateRecord === undefined) {
    throw new Error(`Target ${targetLabel} is invalid for ${target}`);
  }
  return candidateRecord;
}

export function appliesToPolicy(
  source: RecommendationSource,
  catalog: RecommendationCatalogResponse,
  displayPlatform: string,
  policyPlatform: string,
): boolean {
  if (displayPlatform === policyPlatform) {
    return true;
  }
  const importPlatform = catalog.displayToImportPlatform[displayPlatform];
  if (importPlatform === policyPlatform) {
    return true;
  }
  return source === "vendor" && displayPlatform === "ANDROID" && policyPlatform === "ANDROID_ENTERPRISE";
}

function supportedComplianceMapping(mapping: RecommendationRulesetMapping): boolean {
  if (mapping.kind === "relution-native") {
    return typeof mapping.type === "string";
  }
  if (mapping.kind === "apple-schema-profile") {
    return typeof mapping.schemaId === "string";
  }
  if (mapping.kind === "apple-mobileconfig") {
    return typeof mapping.payloadType === "string";
  }
  return false;
}

function fallbackBlockingReasons(recommendation: RecommendationRecord): string[] {
  const reasons = [
    ...implementationOf(recommendation).blockingReasons,
    ...recommendation.relutionMapping.notes,
  ];
  for (const parameter of recommendation.relutionMapping.parameterRequirements ?? []) {
    reasons.push(`Local parameter required: ${parameter.label} (${parameter.path}).`);
  }
  for (const support of recommendation.relutionMapping.processSupport ?? []) {
    reasons.push(`Relution function evidence required: ${support.relutionFunction}.`);
  }
  if (reasons.length > 0) {
    return uniqueStrings(reasons);
  }
  return ["No exact Relution mapping is available for automatic compliance checking."];
}

function blockingReasonsForResult(
  recommendation: RecommendationRecord,
  mappingResults: ComplianceMappingResult[],
  remediationOptions: ComplianceRemediationOption[],
  status: ComplianceStatus,
): string[] {
  if (status === "compliant") {
    return [];
  }
  const reasons = [...recommendation.relutionMapping.notes, ...implementationOf(recommendation).blockingReasons];
  for (const mappingResult of mappingResults) {
    if (mappingResult.status === "missing") {
      reasons.push(`Missing ${mappingResult.target}.`);
    } else if (mappingResult.status === "mismatch") {
      reasons.push(`${mappingResult.target} exists but does not match the recommendation.`);
    } else if (mappingResult.status === "ambiguous") {
      reasons.push(`Multiple candidate settings exist for ${mappingResult.target}; Relution remediation cannot choose one safely.`);
    } else if (mappingResult.status === "unsupported") {
      reasons.push(`The mapping target ${mappingResult.target} is not supported for compliance automation.`);
    }
  }
  if (status === "choice-required" && remediationOptions.length > 1) {
    reasons.push("Multiple exact remediation variants are available; choose one explicit variant.");
  }
  return uniqueStrings(reasons);
}

function implementationOf(recommendation: RecommendationRecord): RecommendationImplementation {
  if (recommendation.implementation !== undefined) {
    return recommendation.implementation;
  }
  const exact = recommendation.relutionMapping.status === "exact";
  const surfaces = uniqueStrings([
    ...recommendation.relutionMapping.candidates.map((candidate) => candidate.kind),
    ...recommendation.relutionMapping.rulesetMappings.map((mapping) => mapping.kind),
    ...(Array.isArray(recommendation.fallbackTranslations) && recommendation.fallbackTranslations.length > 0 ? ["helper"] : []),
  ]) as RecommendationImplementationSurface[];
  if (exact) {
    return {
      category: "relution-achievable",
      surfaces,
      importableVia: recommendation.relutionMapping.rulesetMappings.some((mapping) => mapping.kind === "relution-native")
        ? ["apply-json", "ruleset-import"]
        : ["ruleset-import"],
      blockingReasons: recommendation.relutionMapping.notes,
    };
  }
  if (recommendation.relutionMapping.candidates.length > 0) {
    return {
      category: "relution-partial",
      surfaces,
      importableVia: [],
      blockingReasons: recommendation.relutionMapping.notes,
    };
  }
  if (recommendation.relutionMapping.status === "parameterized") {
    return {
      category: "relution-partial",
      surfaces,
      importableVia: [],
      blockingReasons: recommendation.relutionMapping.notes,
    };
  }
  return {
    category: "gap",
    surfaces,
    importableVia: [],
    blockingReasons: recommendation.relutionMapping.notes,
  };
}

export function selectedPolicyTarget(
  workspace: PolicyWorkspace,
  selection: ComplianceSelection,
): { policy: { path: string; document: JsonRecord }; policyName: string; policyPlatform: string; configurations: JsonRecord[] } {
  const policy = workspace.policies[selection.policyIndex];
  const policyDocument = asRecord(policy?.document);
  if (policy === undefined || policyDocument === undefined) {
    throw new Error(`Policy selection is invalid: ${selection.policyIndex}`);
  }
  const versions = Array.isArray(policyDocument.versions) ? policyDocument.versions : [];
  const version = asRecord(versions[selection.versionIndex]);
  if (version === undefined) {
    throw new Error(`Policy version selection is invalid: ${selection.versionIndex}`);
  }
  let configurations: JsonRecord[];
  if (Array.isArray(version.configurations)) {
    configurations = version.configurations.filter((entry): entry is JsonRecord => asRecord(entry) !== undefined) as JsonRecord[];
    if (configurations !== version.configurations) {
      version.configurations = configurations;
    }
  } else {
    configurations = [];
    version.configurations = configurations;
  }
  const policyName = typeof policyDocument.name === "string" ? policyDocument.name : policy.path;
  const policyPlatform = typeof policyDocument.platform === "string" ? policyDocument.platform : "";
  if (policyPlatform.length === 0) {
    throw new Error(`Selected policy platform is invalid: ${String(policyDocument.platform)}`);
  }
  return {
    policy: {
      path: policy.path,
      document: policyDocument,
    },
    policyName,
    policyPlatform,
    configurations,
  };
}

function configurationCandidates(
  configurations: JsonRecord[],
  predicate: (details: JsonRecord) => boolean,
): Array<{ details: JsonRecord; reference: ComplianceConfigurationReference }> {
  return configurations.flatMap((configuration, configurationIndex) => {
    const details = asRecord(configuration.details);
    if (details === undefined || !predicate(details)) {
      return [];
    }
    return [{
      details,
      reference: configurationReference(details, configurationIndex),
    }];
  });
}

function configurationReference(details: JsonRecord, configurationIndex: number): ComplianceConfigurationReference {
  const label = typeof details.displayName === "string" && details.displayName.length > 0
    ? details.displayName
    : typeof details.type === "string" && details.type.length > 0
      ? details.type
      : `Configuration ${configurationIndex + 1}`;
  const reference: ComplianceConfigurationReference = {
    configurationIndex,
    type: typeof details.type === "string" ? details.type : "UNKNOWN",
    label,
  };
  if (typeof details.secondLevelPayloadType === "string" && details.secondLevelPayloadType.length > 0) {
    reference.payloadType = details.secondLevelPayloadType;
  }
  return reference;
}

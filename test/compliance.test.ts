import assert from "node:assert/strict";
import test from "node:test";
import {
  createAppleSchemaProfileConfiguration,
  type AppleSchemaCatalog,
  type AppleSchemaEntry,
} from "../src/apple-schema.js";
import {
  applyComplianceRemediationToWorkspace,
  buildComplianceReport,
  type ComplianceSourceArtifacts,
} from "../src/compliance.js";
import type {
  RecommendationCatalogResponse,
  RecommendationRecord,
  RecommendationSettingBundleCatalog,
  RecommendationSource,
} from "../src/recommendation-types.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../src/templates.js";
import type { PolicyWorkspace } from "../src/workspace.js";

test("buildComplianceReport marks exact native mappings compliant and exact gaps", () => {
  const artifacts = createArtifacts({
    source: "bsi",
    recommendations: [
      createNativeRecommendation({
        id: "bsi-native-compliant",
        title: "Compliant native recommendation",
        targetType: "NATIVE_SINGLE",
        values: { enforced: true },
      }),
      createNativeRecommendation({
        id: "bsi-native-gap",
        title: "Gap native recommendation",
        targetType: "NATIVE_MULTI",
        values: { enforced: true },
      }),
    ],
    bundles: [
      createSettingBundle({
        source: "bsi",
        bundleId: "bsi-native-multi",
        targetType: "NATIVE_MULTI",
        recommendationIds: ["bsi-native-gap"],
        details: {
          type: "NATIVE_MULTI",
          enforced: true,
        },
      }),
    ],
  });

  const workspace = createWorkspace("IOS", [
    createConfiguration("NATIVE_SINGLE", {
      enforced: true,
    }),
  ]);

  const report = buildComplianceReport({
    workspace,
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["bsi"],
    catalogs: artifacts,
    bundle: createBundle(),
    appleSchema: createAppleSchemaCatalog(),
  });

  assert.equal(report.summary.totalRecommendations, 2);
  assert.equal(report.summary.byStatus.compliant, 1);
  assert.equal(report.summary.byStatus["exact-gap"], 1);

  const compliant = resultById(report, "bsi", "bsi-native-compliant");
  assert.equal(compliant.status, "compliant");
  assert.equal(compliant.mappingResults[0]?.status, "compliant");
  assert.deepEqual(compliant.matchedConfigurations.map((entry) => entry.configurationIndex), [0]);

  const gap = resultById(report, "bsi", "bsi-native-gap");
  assert.equal(gap.status, "exact-gap");
  assert.equal(gap.mappingResults[0]?.status, "missing");
  assert.deepEqual(gap.remediationOptions.map((option) => option.id), ["native-bundle:bsi-native-multi"]);
});

test("buildComplianceReport treats stricter numeric values as compliant for at-least constraints", () => {
  const artifacts = createArtifacts({
    source: "cis",
    recommendations: [
      createNativeRecommendation({
        id: "cis-password-length",
        title: "Minimum password length",
        targetType: "NATIVE_SINGLE",
        values: { minLength: 14 },
        constraints: [{ path: "minLength", operator: "atLeast", value: 14 }],
      }),
    ],
  });

  const report = buildComplianceReport({
    workspace: createWorkspace("IOS", [
      createConfiguration("NATIVE_SINGLE", {
        minLength: 16,
      }),
    ]),
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["cis"],
    catalogs: artifacts,
    bundle: createBundle(),
    appleSchema: createAppleSchemaCatalog(),
  });

  const result = resultById(report, "cis", "cis-password-length");
  assert.equal(result.status, "compliant");
  assert.equal(result.mappingResults[0]?.status, "compliant");
});

test("Windows Custom CSP exact mappings are evaluated and applied as multi-instance settings", () => {
  const customCspValues = {
    enabled: true,
    name: "PreventEnablingLockScreenCamera",
    installSyncML: "<Replace><Item><Target><LocURI>./Device/Vendor/MSFT/Policy/Config/DeviceLock/PreventEnablingLockScreenCamera</LocURI></Target><Data><![CDATA[<enabled/>]]></Data></Item></Replace>",
    deleteSyncML: "<Delete><Item><Target><LocURI>./Device/Vendor/MSFT/Policy/Config/DeviceLock/PreventEnablingLockScreenCamera</LocURI></Target></Item></Delete>",
    wrapInAtomic: true,
  };
  const artifacts = createArtifacts({
    source: "vendor",
    recommendations: [
      createNativeRecommendation({
        id: "vendor-custom-csp",
        title: "Prevent enabling lock screen camera",
        targetType: "WINDOWS_CUSTOM_CSP",
        values: customCspValues,
        platform: "WINDOWS",
      }),
    ],
    bundles: [
      createSettingBundle({
        source: "vendor",
        bundleId: "vendor-custom-csp",
        targetType: "WINDOWS_CUSTOM_CSP",
        recommendationIds: ["vendor-custom-csp"],
        details: { type: "WINDOWS_CUSTOM_CSP", ...customCspValues },
        policyPlatform: "WINDOWS",
      }),
    ],
  });
  const workspace = createWorkspace("WINDOWS", [
    createConfiguration("WINDOWS_CUSTOM_CSP", {
      enabled: true,
      name: "DifferentCspSetting",
      installSyncML: "<Replace/>",
      deleteSyncML: "<Delete/>",
      wrapInAtomic: true,
    }),
  ]);

  const report = buildComplianceReport({
    workspace,
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["vendor"],
    catalogs: artifacts,
    bundle: createBundle(["WINDOWS"]),
    appleSchema: createAppleSchemaCatalog(),
  });
  const result = resultById(report, "vendor", "vendor-custom-csp");
  assert.equal(result.status, "exact-gap");
  assert.equal(result.mappingResults[0]?.status, "missing");

  const remediated = applyComplianceRemediationToWorkspace({
    workspace,
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["vendor"],
    catalogs: artifacts,
    bundle: createBundle(["WINDOWS"]),
    appleSchema: createAppleSchemaCatalog(),
    source: "vendor",
    recommendationId: "vendor-custom-csp",
    remediationId: "native-bundle:vendor-custom-csp",
  });
  const configurations = selectedConfigurations(remediated.workspace);
  assert.equal(configurations.length, 2);
  assert.equal(configurations.some((configuration) => configuration.details?.name === "PreventEnablingLockScreenCamera"), true);
  assert.equal(resultById(remediated.report, "vendor", "vendor-custom-csp").status, "compliant");
});

test("buildComplianceReport marks variant-backed native remediations as choice-required", () => {
  const artifacts = createArtifacts({
    source: "vendor",
    recommendations: [
      createNativeRecommendation({
        id: "vendor-system-update",
        title: "Choose a system update strategy",
        platform: "ANDROID",
        targetType: "NATIVE_MULTI",
        values: { systemUpdateType: "WINDOWED" },
      }),
    ],
    bundles: [
      createSettingBundle({
        source: "vendor",
        bundleId: "vendor-system-update-automatic",
        policyPlatform: "ANDROID_ENTERPRISE",
        sourcePlatform: "ANDROID",
        targetType: "NATIVE_MULTI",
        variantId: "automatic",
        recommendationIds: ["vendor-system-update"],
        details: {
          type: "NATIVE_MULTI",
          systemUpdateType: "AUTOMATIC",
        },
      }),
      createSettingBundle({
        source: "vendor",
        bundleId: "vendor-system-update-windowed",
        policyPlatform: "ANDROID_ENTERPRISE",
        sourcePlatform: "ANDROID",
        targetType: "NATIVE_MULTI",
        variantId: "windowed",
        recommendationIds: ["vendor-system-update"],
        details: {
          type: "NATIVE_MULTI",
          systemUpdateType: "WINDOWED",
        },
      }),
    ],
    variantGroups: [
      {
        groupId: "vendor-system-update-variants",
        policyPlatform: "ANDROID_ENTERPRISE",
        targetType: "NATIVE_MULTI",
        conflictingPaths: ["systemUpdateType"],
        variants: [
          {
            bundleId: "vendor-system-update-automatic",
            variantId: "automatic",
            importFilePath: "example/vendor-references/relution-settings/ANDROID_ENTERPRISE/NATIVE_MULTI--automatic.json",
          },
          {
            bundleId: "vendor-system-update-windowed",
            variantId: "windowed",
            importFilePath: "example/vendor-references/relution-settings/ANDROID_ENTERPRISE/NATIVE_MULTI--windowed.json",
          },
        ],
      },
    ],
  });

  const report = buildComplianceReport({
    workspace: createWorkspace("ANDROID_ENTERPRISE"),
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["vendor"],
    catalogs: artifacts,
    bundle: createBundle(["IOS", "ANDROID_ENTERPRISE"]),
    appleSchema: createAppleSchemaCatalog(),
  });

  const result = resultById(report, "vendor", "vendor-system-update");
  assert.equal(result.status, "choice-required");
  assert.deepEqual(result.remediationOptions.map((option) => option.id).sort(), [
    "native-bundle:vendor-system-update-automatic",
    "native-bundle:vendor-system-update-windowed",
  ]);
});

test("applyComplianceRemediationToWorkspace creates a missing native configuration from a bundle", () => {
  const artifacts = createArtifacts({
    source: "bsi",
    recommendations: [
      createNativeRecommendation({
        id: "bsi-native-gap",
        title: "Gap native recommendation",
        targetType: "NATIVE_MULTI",
        values: { enforced: true },
      }),
    ],
    bundles: [
      createSettingBundle({
        source: "bsi",
        bundleId: "bsi-native-multi",
        targetType: "NATIVE_MULTI",
        recommendationIds: ["bsi-native-gap"],
        details: {
          type: "NATIVE_MULTI",
          enforced: true,
        },
      }),
    ],
  });

  const applied = applyComplianceRemediationToWorkspace({
    workspace: createWorkspace("IOS"),
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["bsi"],
    source: "bsi",
    recommendationId: "bsi-native-gap",
    remediationId: "native-bundle:bsi-native-multi",
    catalogs: artifacts,
    bundle: createBundle(),
    appleSchema: createAppleSchemaCatalog(),
  });

  const configurations = selectedConfigurations(applied.workspace);
  assert.equal(configurations.length, 1);
  assert.equal(configurations[0]?.details?.type, "NATIVE_MULTI");
  assert.equal(configurations[0]?.details?.enforced, true);

  const result = resultById(applied.report, "bsi", "bsi-native-gap");
  assert.equal(result.status, "compliant");
});

test("applyComplianceRemediationToWorkspace creates a missing Apple schema profile from exact mappings", () => {
  const appleEntry = createAppleApplicationAccessEntry();
  const artifacts = createArtifacts({
    source: "cis",
    recommendations: [
      createAppleSchemaRecommendation({
        id: "cis-ios-safari",
        title: "Require Safari fraud warnings",
        schemaId: appleEntry.id,
        values: { safariForceFraudWarning: true },
      }),
    ],
  });

  const applied = applyComplianceRemediationToWorkspace({
    workspace: createWorkspace("IOS"),
    selection: { policyIndex: 0, versionIndex: 0 },
    sources: ["cis"],
    source: "cis",
    recommendationId: "cis-ios-safari",
    remediationId: "recommendation:cis:cis-ios-safari",
    catalogs: artifacts,
    bundle: createBundle(),
    appleSchema: createAppleSchemaCatalog([appleEntry]),
  });

  const configurations = selectedConfigurations(applied.workspace);
  assert.equal(configurations.length, 1);
  assert.equal(configurations[0]?.details?.type, "APPLE_MOBILECONFIG");
  assert.equal(configurations[0]?.details?.secondLevelPayloadType, "com.apple.applicationaccess");

  const result = resultById(applied.report, "cis", "cis-ios-safari");
  assert.equal(result.status, "compliant");
});

function createArtifacts(options: {
  source: RecommendationSource;
  recommendations: RecommendationRecord[];
  bundles?: RecommendationSettingBundleCatalog["bundles"];
  variantGroups?: RecommendationSettingBundleCatalog["variantGroups"];
}): Partial<Record<RecommendationSource, ComplianceSourceArtifacts>> {
  return {
    [options.source]: {
      recommendationCatalog: createRecommendationCatalog(options.source, options.recommendations),
      settingBundleCatalog: createSettingsCatalog(options.source, options.bundles ?? [], options.variantGroups ?? []),
    },
  };
}

function createRecommendationCatalog(source: RecommendationSource, recommendations: RecommendationRecord[]): RecommendationCatalogResponse {
  return {
    source,
    label: source.toUpperCase(),
    available: true,
    verifiedAsOf: "2026-04-24",
    recommendationCount: recommendations.length,
    displayPlatforms: [...new Set(recommendations.map((entry) => entry.platform))],
    importPlatforms: [...new Set(recommendations.map((entry) => entry.platform === "ANDROID" ? "ANDROID_ENTERPRISE" : entry.platform))],
    displayToImportPlatform: Object.fromEntries(
      [...new Set(recommendations.map((entry) => entry.platform))].map((platform) => [platform, source === "vendor" && platform === "ANDROID" ? "ANDROID_ENTERPRISE" : platform]),
    ),
    recommendations,
    ruleset: {
      version: 1,
      name: `${source} ruleset`,
      policies: [],
    },
  };
}

function createSettingsCatalog(
  source: RecommendationSource,
  bundles: RecommendationSettingBundleCatalog["bundles"],
  variantGroups: RecommendationSettingBundleCatalog["variantGroups"],
): RecommendationSettingBundleCatalog {
  return {
    version: 1,
    name: `${source} bundles`,
    verifiedAsOf: "2026-04-24",
    sourceRecommendationCatalogPath: `example/${source}-references/${source}-recommendations.json`,
    importableRulesetPath: `example/${source}-references/${source}-relution-ruleset.json`,
    bundles,
    variantGroups,
    nonImportableRecommendations: [],
  };
}

function createSettingBundle(options: {
  source: RecommendationSource;
  bundleId: string;
  targetType: string;
  recommendationIds: string[];
  details: Record<string, unknown>;
  policyPlatform?: string;
  sourcePlatform?: string;
  variantId?: string;
}): RecommendationSettingBundleCatalog["bundles"][number] {
  const policyPlatform = options.policyPlatform ?? "IOS";
  return {
    bundleId: options.bundleId,
    source: options.source,
    sourcePlatform: options.sourcePlatform ?? policyPlatform,
    policyPlatform,
    targetType: options.targetType,
    importFilePath: `example/${options.source}-references/relution-settings/${policyPlatform}/${options.targetType}.json`,
    details: options.details,
    derivedFromRecommendationIds: options.recommendationIds,
    sourceIds: [options.bundleId],
    mergeStrategy: "deep-merge",
    ...(options.variantId === undefined ? {} : { variantId: options.variantId }),
  };
}

function createNativeRecommendation(options: {
  id: string;
  title: string;
  targetType: string;
  values: Record<string, unknown>;
  platform?: string;
  constraints?: Array<{ path: string; operator: "atLeast" | "atMost" | "containsAll"; value: unknown }>;
}): RecommendationRecord {
  const platform = options.platform ?? "IOS";
  return {
    id: options.id,
    platform,
    osFamily: platform,
    policyName: `${platform} baseline`,
    moduleId: "SYS.1",
    moduleTitle: "Baseline",
    moduleRole: "baseline",
    sourceIds: [options.id],
    supportingSourceIds: [],
    category: "Basis-Anforderungen",
    requirementId: options.id.toUpperCase(),
    title: options.title,
    status: "active",
    protectionLevel: "B",
    actors: [],
    paragraphs: [options.title],
    requirementText: options.title,
    reason: options.title,
    descriptionContext: [],
    checklistThreatIds: [],
    checklistThreatTitles: [],
    moduleThreatContext: [],
    errata: [],
    relutionMapping: {
      status: "exact",
      mergeableInImportableRuleset: true,
      candidates: [{ kind: "relution-native", target: options.targetType, fieldPaths: Object.keys(options.values) }],
      rulesetMappings: [
        {
          kind: "relution-native",
          type: options.targetType,
          values: options.values,
          ...(options.constraints === undefined ? {} : { constraints: options.constraints }),
        },
      ],
      notes: [],
    },
    implementation: {
      category: "relution-achievable",
      surfaces: ["relution-native"],
      importableVia: ["apply-json", "ruleset-import"],
      blockingReasons: [],
    },
    fallbackTranslations: [],
  };
}

function createAppleSchemaRecommendation(options: {
  id: string;
  title: string;
  schemaId: string;
  values: Record<string, unknown>;
}): RecommendationRecord {
  return {
    id: options.id,
    title: options.title,
    platform: "IOS",
    osFamily: "IOS",
    benchmarkId: "cis-ios",
    benchmarkTitle: "CIS iOS Benchmark",
    benchmarkVersion: "1.0.0",
    benchmarkDate: "2026-04-24",
    managementSurface: "APPLE_CONFIGURATION_PROFILE",
    sourcePdfPath: "example/cis-references/downloads/pdf/CIS_iOS.pdf",
    sourceIds: ["cis-ios"],
    recommendationId: "2.2.2",
    profileApplicability: ["Level 1"],
    description: options.title,
    rationale: options.title,
    impact: "",
    audit: "",
    remediation: "",
    defaultValue: false,
    references: [],
    recommendedValue: true,
    helperFallbacks: [],
    relutionMapping: {
      status: "exact",
      mergeableInImportableRuleset: true,
      candidates: [{ kind: "apple-schema-profile", target: options.schemaId, fieldPaths: Object.keys(options.values) }],
      rulesetMappings: [{ kind: "apple-schema-profile", schemaId: options.schemaId, values: options.values }],
      notes: [],
    },
    implementation: {
      category: "relution-achievable",
      surfaces: ["apple-schema-profile"],
      importableVia: ["ruleset-import"],
      blockingReasons: [],
    },
    fallbackTranslations: [],
    familySourceId: "cis-ios-family",
    additionalInformation: "",
    assessmentStatus: "Automated",
  };
}

function createWorkspace(platform: string, configurations: Array<Record<string, unknown>> = []): PolicyWorkspace {
  return {
    metadata: {},
    report: {},
    policies: [
      {
        path: "policies/policy_test.json",
        document: {
          uuid: "POLICY-1",
          name: `${platform} policy`,
          platform,
          versions: [
            {
              uuid: "VERSION-1",
              configurations,
            },
          ],
        },
      },
    ],
  };
}

function createConfiguration(type: string, details: Record<string, unknown>): Record<string, unknown> {
  return {
    uuid: `CONF-${type}`,
    details: {
      uuid: `DETAIL-${type}`,
      type,
      ...details,
    },
  };
}

function createBundle(platforms: string[] = ["IOS"]): RelutionTemplateBundle {
  const templates: ConfigurationTemplate[] = [
    {
      type: "NATIVE_SINGLE",
      label: "Native Single",
      schemaName: "NativeSingle",
      platforms,
      enrollmentTypes: [],
      multiConfig: false,
      portalHidden: false,
      placeholders: [],
      required: [],
      fields: [],
    },
    {
      type: "NATIVE_MULTI",
      label: "Native Multi",
      schemaName: "NativeMulti",
      platforms,
      enrollmentTypes: [],
      multiConfig: true,
      portalHidden: false,
      placeholders: [],
      required: [],
      fields: [],
    },
    {
      type: "WINDOWS_CUSTOM_CSP",
      label: "Windows Custom CSP",
      schemaName: "WindowsCustomCsp",
      platforms: ["WINDOWS"],
      enrollmentTypes: [],
      multiConfig: true,
      portalHidden: false,
      placeholders: [],
      required: [],
      fields: [],
    },
  ];
  return {
    serverVersion: "26.1.1",
    sourceImage: "relution/server:26.1.1",
    sourceImageDigest: "sha256:test",
    generatedAt: "2026-04-24T00:00:00.000Z",
    refreshDiagnostics: {
      runtimeMetadata: {
        source: "reflected",
        reflectedCount: templates.length,
        configurationTypeCount: templates.length,
      },
      iosSystemAppsLoaded: false,
      springConfigurationMetadataLoaded: false,
    },
    platforms,
    enrollmentTypes: [],
    configurationTypes: templates,
    schemas: {},
    iosSystemApps: {},
    springConfigurationMetadata: {},
  };
}

function createAppleSchemaCatalog(entries: AppleSchemaEntry[] = [createAppleApplicationAccessEntry()]): AppleSchemaCatalog {
  return {
    version: 1,
    source: {
      repository: "apple/device-management",
      revision: "test",
      generatedAt: "2026-04-24T00:00:00.000Z",
    },
    counts: {
      profile: entries.length,
      "ddm-configuration": 0,
      "ddm-asset": 0,
      "ddm-activation": 0,
      "ddm-management": 0,
      "ddm-status": 0,
      "mdm-command": 0,
      "mdm-checkin": 0,
      "ddm-protocol": 0,
    },
    entries,
  };
}

function createAppleApplicationAccessEntry(): AppleSchemaEntry {
  return {
    id: "profile:com.apple.applicationaccess",
    kind: "profile",
    title: "Application Access",
    description: "Restrictions payload.",
    identifier: "com.apple.applicationaccess",
    sourcePath: "profiles/com.apple.applicationaccess.yaml",
    availability: {
      platforms: ["IOS"],
      allowMultiple: false,
      requiresMdm: false,
      deprecated: false,
      notes: [],
    },
    deprecated: false,
    fields: [
      {
        path: "safariForceFraudWarning",
        payloadKey: "safariForceFraudWarning",
        title: "Require Safari fraud warnings",
        kind: "boolean",
        required: false,
        description: "",
        defaultValue: false,
        enumValues: [],
        variableSafe: true,
      },
    ],
  };
}

function resultById(
  report: ReturnType<typeof buildComplianceReport>,
  source: RecommendationSource,
  recommendationId: string,
): ReturnType<typeof buildComplianceReport>["results"][number] {
  const result = report.results.find((entry) => entry.source === source && entry.recommendationId === recommendationId);
  assert.ok(result);
  return result;
}

function selectedConfigurations(
  workspace: PolicyWorkspace,
): Array<{ details?: { type?: string; enforced?: boolean; name?: string; secondLevelPayloadType?: string } }> {
  const policy = workspace.policies[0];
  const document = policy?.document as { versions?: Array<{ configurations?: Array<{ details?: { type?: string; enforced?: boolean; name?: string; secondLevelPayloadType?: string } }> }> } | undefined;
  const version = document?.versions?.[0];
  return Array.isArray(version?.configurations) ? version.configurations : [];
}

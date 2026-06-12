import type { AppleSchemaCatalog } from "../src/apple-schema.js";
import type {
  RecommendationCatalogResponse,
  RecommendationRecord,
  RecommendationSource,
} from "../src/recommendation-types.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../src/templates.js";
import type { PolicyWorkspace } from "../src/workspace.js";

export function createTestAppleSchemaCatalog(): AppleSchemaCatalog {
  return {
    version: 1,
    source: {
      repository: "apple/device-management",
      revision: "test",
      generatedAt: "2026-04-24T00:00:00.000Z",
    },
    counts: {
      profile: 0,
      "ddm-configuration": 0,
      "ddm-asset": 0,
      "ddm-activation": 0,
      "ddm-management": 0,
      "ddm-status": 0,
      "mdm-command": 0,
      "mdm-checkin": 0,
      "ddm-protocol": 0,
    },
    entries: [],
  };
}

export function createTestTemplateBundle(options: {
  readonly platforms?: string[];
  readonly configurationTypes?: ConfigurationTemplate[];
} = {}): RelutionTemplateBundle {
  const configurationTypes = options.configurationTypes ?? [];
  return {
    serverVersion: "26.1.1",
    sourceImage: "relution/server:26.1.1",
    sourceImageDigest: "sha256:test",
    generatedAt: "2026-04-24T00:00:00.000Z",
    refreshDiagnostics: {
      runtimeMetadata: {
        source: "reflected",
        reflectedCount: configurationTypes.length,
        configurationTypeCount: configurationTypes.length,
      },
      iosSystemAppsLoaded: false,
      springConfigurationMetadataLoaded: false,
    },
    platforms: options.platforms ?? ["IOS"],
    enrollmentTypes: [],
    configurationTypes,
    schemas: {},
    iosSystemApps: {},
    springConfigurationMetadata: {},
  };
}

export function createTestPolicyWorkspace(options: {
  readonly platform?: string;
  readonly name?: string;
  readonly configurations?: Array<Record<string, unknown>>;
} = {}): PolicyWorkspace {
  const platform = options.platform ?? "IOS";
  return {
    metadata: {},
    report: {},
    policies: [
      {
        path: "policies/policy_test.json",
        document: {
          name: options.name ?? `${platform} policy`,
          platform,
          versions: [
            {
              configurations: (options.configurations ?? []).map((details, index) => ({
                uuid: `configuration-${String(index)}`,
                details: { uuid: `details-${String(index)}`, ...details },
              })),
            },
          ],
        },
      },
    ],
  };
}

export function createTestRecommendationCatalog(options: {
  readonly source: RecommendationSource;
  readonly label?: string;
  readonly platforms: string[];
  readonly recommendations: RecommendationRecord[];
}): RecommendationCatalogResponse {
  const [displayPlatform = "IOS"] = options.platforms;
  return {
    source: options.source,
    label: options.label ?? options.source.toUpperCase(),
    available: true,
    recommendationCount: options.recommendations.length,
    displayPlatforms: options.platforms,
    importPlatforms: options.platforms,
    displayToImportPlatform: { [displayPlatform]: displayPlatform },
    recommendations: options.recommendations,
  };
}

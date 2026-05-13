import { waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { AppleCompatReport } from "../../../src/apple-compat.js";
import type { AppleSchemaCatalog } from "../../../src/apple-schema.js";
import type { RecommendationCatalogResponse, RecommendationIndexResponse } from "../../../src/recommendation-types.js";
import type { EditorSidecarState } from "../../../src/sidecar.js";
import type { ConfigurationTemplate, RelutionTemplateBundle } from "../../../src/templates.js";
import type { PolicyWorkspace, WorkspaceValidationResult } from "../../../src/workspace.js";
import type { BaselineExpertOptionsResponse, BaselineTemplateOptionsResponse } from "../../../src/baseline-templates.js";
import { createBaselineExpertOptions, createBaselineRuleset, createBaselineTemplateOptions } from "./baseline-test-fixtures.js";
import type { AddGroup, AppState, EditorController, EditorControllerResult, InspectorTab, Selection } from "./types.js";

export function currentReady(result: { current: EditorControllerResult }): Extract<EditorControllerResult, { kind: "ready" }> {
  if (result.current.kind !== "ready") {
    throw new Error(`Expected ready controller, got ${result.current.kind}`);
  }
  return result.current;
}

export async function waitForReady(
  _current: EditorControllerResult,
  result: { current: EditorControllerResult },
): Promise<void> {
  await waitFor(() => {
    expect(result.current.kind).toBe("ready");
  });
}

export function installFetchMock(
  state: AppState = createAppState(),
  options: {
    recommendationIndex?: RecommendationIndexResponse;
    recommendationCatalogs?: Partial<Record<"bsi" | "vendor" | "cis", RecommendationCatalogResponse>>;
    complianceReport?: Record<string, unknown>;
    complianceApply?: Record<string, unknown>;
    baselineTemplates?: {
      readonly index?: BaselineTemplateOptionsResponse;
      readonly template?: unknown;
      readonly expert?: BaselineExpertOptionsResponse;
    };
  } = {},
): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (url === "/api/state") {
      return jsonResponse(state);
    }
    if (url === "/api/recommendations") {
      return jsonResponse(options.recommendationIndex ?? createRecommendationIndex());
    }
    if (url === "/api/recommendations/bsi") {
      return jsonResponse(options.recommendationCatalogs?.bsi ?? createRecommendationCatalog());
    }
    if (url === "/api/recommendations/vendor") {
      return jsonResponse(options.recommendationCatalogs?.vendor ?? createRecommendationCatalog({ source: "vendor", label: "Vendor", displayPlatforms: ["ANDROID"] }));
    }
    if (url === "/api/recommendations/cis") {
      return jsonResponse(options.recommendationCatalogs?.cis ?? createRecommendationCatalog({ source: "cis", label: "CIS" }));
    }
    if (url === "/api/baseline-templates") {
      return jsonResponse(options.baselineTemplates?.index ?? createBaselineTemplateOptions());
    }
    if (url.startsWith("/api/baseline-templates/template")) {
      return jsonResponse(options.baselineTemplates?.template ?? createBaselineRuleset());
    }
    if (url.startsWith("/api/baseline-templates/expert")) {
      return jsonResponse(options.baselineTemplates?.expert ?? createBaselineExpertOptions());
    }
    if (url === "/api/build") {
      return jsonResponse({ outputFile: "fresh-build.rexp", sidecar: state.sidecar });
    }
    if (url === "/api/import") {
      return jsonResponse({
        workspace: state.workspace,
        validation: state.validation,
        keySet: state.keySet,
        sidecar: state.sidecar,
      });
    }
    if (url === "/api/workspace") {
      return jsonResponse({
        workspace: state.workspace,
        validation: state.validation,
      });
    }
    if (url === "/api/workspace/validate") {
      return jsonResponse({ validation: state.validation });
    }
    if (url === "/api/compliance/check") {
      return jsonResponse({ report: options.complianceReport ?? createComplianceReport() });
    }
    if (url === "/api/compliance/apply") {
      return jsonResponse(options.complianceApply ?? {
        workspace: state.workspace,
        validation: state.validation,
        sidecar: state.sidecar,
        report: createComplianceReport({
          results: [],
          summary: {
            totalRecommendations: 0,
            byStatus: {
              compliant: 0,
              "exact-gap": 0,
              "choice-required": 0,
              "parameter-required": 0,
              "not-checkable": 0,
            },
          },
        }),
      });
    }
    throw new Error(`Unhandled fetch in test: ${url} (${init?.method ?? "GET"})`);
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createAppState(): AppState {
  return {
    bundle: createBundle(),
    workspace: createWorkspace(),
    validation: createValidation(),
    outputFile: "stale-build.rexp",
    keySet: false,
    appleCompat: createAppleCompatReport(),
    appleSchema: createAppleSchemaCatalog(),
    sidecar: createSidecar(),
  };
}

export function createEditorControllerStub(overrides: Partial<EditorController> = {}): EditorController {
  return {
    state: createAppState(),
    selection: undefined,
    rawJson: "",
    rawJsonDirty: false,
    selectedType: "",
    addQuery: "",
    addGroup: "all",
    inspectorTab: "validation",
    newPolicyPlatform: "IOS",
    newPolicyName: "",
    keyValue: "",
    status: "",
    isDirty: false,
    isBuildLoading: false,
    hasFreshBuild: false,
    canUndo: false,
    canRedo: false,
    rulesetReport: undefined,
    recommendationIndex: undefined,
    recommendationCatalog: undefined,
    recommendationSource: "bsi",
    recommendationQuery: "",
    recommendationPlatform: "ALL",
    selectedRecommendationId: undefined,
    recommendationsLoading: false,
    recommendationsError: undefined,
    complianceSources: ["bsi", "vendor", "cis"],
    complianceReport: undefined,
    complianceLoading: false,
    complianceError: undefined,
    ddmSchemaId: "",
    mdmCommandSchemaId: "",
    policy: undefined,
    configuration: undefined,
    details: undefined,
    templatesByType: new Map(),
    template: undefined,
    appleCompatSetting: undefined,
    appleSchemaProfile: undefined,
    creatablePlatforms: ["IOS"],
    availableTemplates: [],
    presentNativeTypes: [],
    availableAppleCompatSettings: [],
    availableAppleSchemaProfiles: [],
    availableDdmEntries: [],
    availableMdmCommands: [],
    setSelection: vi.fn<(selection: Selection) => void>(),
    setRawJson: vi.fn<(value: string) => void>(),
    resetRawJson: vi.fn<() => void>(),
    setSelectedType: vi.fn<(value: string) => void>(),
    setAddQuery: vi.fn<(value: string) => void>(),
    setAddGroup: vi.fn<(value: AddGroup) => void>(),
    setInspectorTab: vi.fn<(value: InspectorTab) => void>(),
    setNewPolicyPlatform: vi.fn<(value: string) => void>(),
    setNewPolicyName: vi.fn<(value: string) => void>(),
    setKeyValue: vi.fn<(value: string) => void>(),
    setImportFile: vi.fn<(file: File | undefined) => void>(),
    setJsonTemplateFile: vi.fn<(file: File | undefined) => void>(),
    setRulesetFile: vi.fn<(file: File | undefined) => void>(),
    setStatus: vi.fn<(value: string) => void>(),
    setRecommendationSource: vi.fn<EditorController["setRecommendationSource"]>(),
    setRecommendationQuery: vi.fn<(value: string) => void>(),
    setRecommendationPlatform: vi.fn<(value: string) => void>(),
    setSelectedRecommendationId: vi.fn<(value: string | undefined) => void>(),
    toggleComplianceSource: vi.fn<EditorController["toggleComplianceSource"]>(),
    setDdmSchemaId: vi.fn<(value: string) => void>(),
    setMdmCommandSchemaId: vi.fn<(value: string) => void>(),
    saveWorkspace: vi.fn<() => Promise<void>>(async () => undefined),
    addConfiguration: vi.fn<() => Promise<void>>(async () => undefined),
    addPolicy: vi.fn<() => Promise<void>>(async () => undefined),
    removeConfiguration: vi.fn<EditorController["removeConfiguration"]>(async () => undefined),
    moveConfiguration: vi.fn<EditorController["moveConfiguration"]>(async () => undefined),
    buildArchive: vi.fn<() => Promise<void>>(async () => undefined),
    setActiveKey: vi.fn<() => Promise<void>>(async () => undefined),
    importArchive: vi.fn<() => Promise<void>>(async () => undefined),
    importJsonTemplates: vi.fn<() => Promise<void>>(async () => undefined),
    importRuleset: vi.fn<() => Promise<void>>(async () => undefined),
    importRecommendationRuleset: vi.fn<() => Promise<void>>(async () => undefined),
    refreshCompliance: vi.fn<() => Promise<void>>(async () => undefined),
    applyComplianceRemediation: vi.fn<EditorController["applyComplianceRemediation"]>(async () => undefined),
    addDdmArtifact: vi.fn<() => Promise<void>>(async () => undefined),
    addMdmCommandArtifact: vi.fn<() => Promise<void>>(async () => undefined),
    reconcileSidecar: vi.fn<() => Promise<void>>(async () => undefined),
    removeDdmArtifact: vi.fn<EditorController["removeDdmArtifact"]>(async () => undefined),
    removeMdmCommandArtifact: vi.fn<EditorController["removeMdmCommandArtifact"]>(async () => undefined),
    updateDdmArtifact: vi.fn<EditorController["updateDdmArtifact"]>(async () => undefined),
    updateMdmCommandArtifact: vi.fn<EditorController["updateMdmCommandArtifact"]>(async () => undefined),
    renameSelectedPolicy: vi.fn<EditorController["renameSelectedPolicy"]>(),
    updateSelectedPolicyDescription: vi.fn<EditorController["updateSelectedPolicyDescription"]>(),
    duplicateSelectedPolicy: vi.fn<() => void>(),
    deleteSelectedPolicy: vi.fn<() => void>(),
    clearWorkspace: vi.fn<() => void>(),
    undoWorkspace: vi.fn<() => void>(),
    redoWorkspace: vi.fn<() => void>(),
    applyBaselineTemplate: vi.fn<EditorController["applyBaselineTemplate"]>(async () => undefined),
    applyExpertBaselineSelection: vi.fn<EditorController["applyExpertBaselineSelection"]>(async () => undefined),
    updateSelectedConfiguration: vi.fn<EditorController["updateSelectedConfiguration"]>(),
    applyRawJson: vi.fn<() => void>(),
    ...overrides,
  };
}

export function createBundle(): RelutionTemplateBundle {
  const singleTemplate: ConfigurationTemplate = {
    type: "NATIVE_SINGLE",
    label: "Native Single",
    schemaName: "NativeSingle",
    platforms: ["IOS"],
    enrollmentTypes: [],
    multiConfig: false,
    portalHidden: false,
    placeholders: [],
    required: [],
    fields: [
      {
        path: "name",
        label: "Name",
        kind: "string",
        required: false,
        nullable: false,
        enumValues: [],
        enumLabels: {},
      },
    ],
  };
  const multiTemplate: ConfigurationTemplate = {
    type: "NATIVE_MULTI",
    label: "Native Multi",
    schemaName: "NativeMulti",
    platforms: ["IOS"],
    enrollmentTypes: [],
    multiConfig: true,
    portalHidden: false,
    placeholders: [],
    required: [],
    fields: [],
  };
  return {
    serverVersion: "26.1.1",
    sourceImage: "relution/server:26.1.1",
    sourceImageDigest: "sha256:test",
    generatedAt: "2026-04-23T00:00:00.000Z",
    refreshDiagnostics: {
      runtimeMetadata: {
        source: "reflected",
        reflectedCount: 2,
        configurationTypeCount: 2,
      },
      iosSystemAppsLoaded: false,
      springConfigurationMetadataLoaded: false,
    },
    platforms: ["IOS"],
    enrollmentTypes: [],
    configurationTypes: [singleTemplate, multiTemplate],
    schemas: {},
    iosSystemApps: {},
    springConfigurationMetadata: {},
  };
}

export function createWorkspace(): PolicyWorkspace {
  return {
    metadata: {},
    report: {},
    policies: [
      {
        path: "policies/policy_test.json",
        document: {
          name: "Test Policy",
          platform: "IOS",
          versions: [
            {
              uuid: "VERSION-1",
              configurations: [
                {
                  uuid: "CONF-1",
                  details: {
                    uuid: "DETAIL-1",
                    type: "NATIVE_SINGLE",
                    name: "Original name",
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

export function createValidation(): WorkspaceValidationResult {
  return {
    ok: true,
    errors: [],
  };
}

export function createAppleCompatReport(): AppleCompatReport {
  return {
    summary: {
      totalJamfGapSettings: 0,
      mobileconfigBacked: 0,
      notMobileconfigWireable: 0,
      relutionHasMobileconfigTransport: true,
      relutionMobileconfigPlatforms: ["IOS"],
    },
    sources: [],
    settings: [],
  };
}

export function createAppleSchemaCatalog(): AppleSchemaCatalog {
  return {
    version: 1,
    source: {
      repository: "apple/device-management",
      revision: "test-revision",
      generatedAt: "2026-04-23T00:00:00.000Z",
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

export function createSidecar(): EditorSidecarState {
  return {
    version: 1,
    appleSchemaRevision: "test-revision",
    mobileConfigRestore: [],
    ddmArtifacts: [],
    mdmCommandArtifacts: [],
    customManifests: [],
  };
}

export function createRecommendationIndex(): RecommendationIndexResponse {
  return {
    sources: [
      {
        source: "bsi",
        label: "BSI",
        available: true,
        verifiedAsOf: "2026-04-23",
        recommendationCount: 1,
        displayPlatforms: ["IOS", "MACOS"],
        importPlatforms: ["IOS", "MACOS"],
        displayToImportPlatform: { IOS: "IOS", MACOS: "MACOS" },
      },
      {
        source: "vendor",
        label: "Vendor",
        available: true,
        verifiedAsOf: "2026-04-23",
        recommendationCount: 1,
        displayPlatforms: ["ANDROID"],
        importPlatforms: ["ANDROID_ENTERPRISE"],
        displayToImportPlatform: { ANDROID: "ANDROID_ENTERPRISE" },
      },
      {
        source: "cis",
        label: "CIS",
        available: true,
        verifiedAsOf: "2026-04-23",
        recommendationCount: 1,
        displayPlatforms: ["IOS"],
        importPlatforms: ["IOS"],
        displayToImportPlatform: { IOS: "IOS" },
      },
    ],
  };
}

export function createRecommendationCatalog(
  overrides: Partial<RecommendationCatalogResponse> = {},
): RecommendationCatalogResponse {
  return {
    source: "bsi",
    label: "BSI",
    available: true,
    verifiedAsOf: "2026-04-23",
    recommendationCount: 1,
    displayPlatforms: ["IOS", "MACOS"],
    importPlatforms: ["IOS", "MACOS"],
    displayToImportPlatform: { IOS: "IOS", MACOS: "MACOS" },
    recommendations: [
      {
        id: "bsi-ios-passcode",
        platform: "IOS",
        osFamily: "IOS",
        policyName: "iOS BSI Grundschutz",
        moduleId: "SYS.1",
        moduleTitle: "Mobile baseline",
        moduleRole: "baseline",
        sourceIds: ["source-1"],
        supportingSourceIds: [],
        category: "Basis-Anforderungen",
        requirementId: "SYS.1.A1",
        title: "Use a strong passcode",
        status: "active",
        protectionLevel: "B",
        actors: [],
        paragraphs: ["Use a strong passcode."],
        requirementText: "Use a strong passcode.",
        reason: "Because weak passcodes are weak.",
        descriptionContext: [],
        checklistThreatIds: [],
        checklistThreatTitles: [],
        moduleThreatContext: [],
        errata: [],
        relutionMapping: {
          status: "exact",
          mergeableInImportableRuleset: true,
          candidates: [
            { kind: "relution-native", target: "NATIVE_SINGLE", fieldPaths: ["name"] },
          ],
          rulesetMappings: [
            { kind: "relution-native", type: "NATIVE_SINGLE", values: { name: "Recommendation applied", type: "NATIVE_SINGLE" } },
          ],
          notes: [],
        },
      },
    ],
    ruleset: {
      version: 1,
      name: "BSI Recommendations",
      verifiedAsOf: "2026-04-23",
      sourceIndexPath: "example/bsi-references/sources.json",
      recommendationCatalogPath: "example/bsi-references/bsi-recommendations.json",
      policies: [
        {
          platform: "IOS",
          name: "iOS BSI Grundschutz",
          rules: [
            {
              id: "bsi-ios-passcode",
              title: "Use a strong passcode",
              mappings: [
                {
                  kind: "relution-native",
                  type: "NATIVE_SINGLE",
                  values: {
                    type: "NATIVE_SINGLE",
                    name: "Recommendation applied",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

export function createComplianceReport(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    policyPath: "policies/policy_test.json",
    policyName: "Test Policy",
    policyPlatform: "IOS",
    versionIndex: 0,
    sources: ["bsi", "vendor", "cis"],
    results: [
      {
        id: "bsi:bsi-native-gap",
        source: "bsi",
        recommendationId: "bsi-native-gap",
        recommendation: createRecommendationCatalog().recommendations[0],
        status: "exact-gap",
        mappingResults: [
          {
            kind: "relution-native",
            target: "NATIVE_MULTI",
            expectedValues: { enforced: true },
            status: "missing",
            matchingConfigurations: [],
            candidateConfigurations: [],
          },
        ],
        matchedConfigurations: [],
        blockingReasons: ["Missing NATIVE_MULTI setting"],
        remediationOptions: [
          {
            id: "native-bundle:bsi-native-bundle",
            kind: "native-bundle",
            label: "Apply NATIVE_MULTI exact bundle",
            coveredRecommendationIds: ["bsi-native-gap"],
            surfaces: ["relution-native"],
            bundleId: "bsi-native-bundle",
            targetType: "NATIVE_MULTI",
          },
        ],
      },
    ],
    summary: {
      totalRecommendations: 1,
      byStatus: {
        compliant: 0,
        "exact-gap": 1,
        "choice-required": 0,
        "parameter-required": 0,
        "not-checkable": 0,
      },
    },
    ...overrides,
  };
}

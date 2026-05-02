import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorController } from "./useEditorController.js";
import {
  createAppState,
  createComplianceReport,
  createRecommendationCatalog,
  createRecommendationIndex,
  createSidecar,
  createValidation,
  createWorkspace,
  currentReady,
  installFetchMock,
  waitForReady,
} from "./useEditorController.test-helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEditorController", () => {
it("sets beforeunload returnValue when the workspace is dirty", async () => {
  installFetchMock();
  const { result } = renderHook(() => useEditorController());
  await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await act(async () => {
      const controller = currentReady(result).controller;
      controller.updateSelectedConfiguration({
        ...(controller.configuration ?? {}),
        details: {
          ...(controller.details ?? {}),
          name: "Dirty name",
        },
      });
    });

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(event, "returnValue", { configurable: true, writable: true, value: undefined });

    window.dispatchEvent(event);

  expect(event.returnValue).toBe("");
});

it("clears the dirty beforeunload warning after undo restores a clean workspace", async () => {
  installFetchMock();
  const { result } = renderHook(() => useEditorController());
  await waitForReady(result.current, result);

  await act(async () => {
    currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
  });

  await act(async () => {
    const controller = currentReady(result).controller;
    controller.updateSelectedConfiguration({
      ...(controller.configuration ?? {}),
      details: {
        ...(controller.details ?? {}),
        name: "Dirty name",
      },
    });
  });

  await act(async () => {
    currentReady(result).controller.undoWorkspace();
  });

  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  Object.defineProperty(event, "returnValue", { configurable: true, writable: true, value: undefined });

  window.dispatchEvent(event);

  expect(event.returnValue).toBeUndefined();
});

it("supports redo after undoing a local workspace edit", async () => {
  installFetchMock();
  const { result } = renderHook(() => useEditorController());
  await waitForReady(result.current, result);

  await act(async () => {
    currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
  });

  await act(async () => {
    const controller = currentReady(result).controller;
    controller.updateSelectedConfiguration({
      ...(controller.configuration ?? {}),
      details: {
        ...(controller.details ?? {}),
        name: "Redo name",
      },
    });
  });

  expect(currentReady(result).controller.canUndo).toBe(true);
  expect(currentReady(result).controller.canRedo).toBe(false);

  await act(async () => {
    currentReady(result).controller.undoWorkspace();
  });

  expect(currentReady(result).controller.details?.name).toBe("Original name");
  expect(currentReady(result).controller.canRedo).toBe(true);

  await act(async () => {
    currentReady(result).controller.redoWorkspace();
  });

  expect(currentReady(result).controller.details?.name).toBe("Redo name");
  expect(currentReady(result).controller.canUndo).toBe(true);
});

it("clears the workspace with undo and redo support", async () => {
  installFetchMock();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { result } = renderHook(() => useEditorController());
  await waitForReady(result.current, result);

  expect(currentReady(result).controller.state.workspace.policies.length).toBe(1);

  await act(async () => {
    currentReady(result).controller.clearWorkspace();
  });

  expect(currentReady(result).controller.state.workspace.policies.length).toBe(0);
  expect(currentReady(result).controller.isDirty).toBe(true);
  expect(currentReady(result).controller.status).toBe("Cleared workspace");

  await act(async () => {
    currentReady(result).controller.undoWorkspace();
  });

  expect(currentReady(result).controller.state.workspace.policies.length).toBe(1);

  await act(async () => {
    currentReady(result).controller.redoWorkspace();
  });

  expect(currentReady(result).controller.state.workspace.policies.length).toBe(0);
});

it("applies a baseline template through the ruleset importer", async () => {
  installFetchMock();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { result } = renderHook(() => useEditorController());
  await waitForReady(result.current, result);

  await act(async () => {
    await currentReady(result).controller.applyBaselineTemplate({ platform: "IOS", tier: 3, shape: "modules" });
  });

  const ready = currentReady(result).controller;
  expect(ready.status).toBe("Applied baseline template");
  expect(ready.isDirty).toBe(true);
  expect(ready.canUndo).toBe(true);
  expect(ready.rulesetReport?.applied.map((entry) => entry.ruleId)).toEqual(["baseline-ios-passcode"]);
  expect(JSON.stringify(ready.state.workspace)).toContain("Baseline imported setting");

  await act(async () => {
    currentReady(result).controller.undoWorkspace();
  });

  expect(JSON.stringify(currentReady(result).controller.state.workspace)).toContain("Original name");
});

it("applies an expert baseline selection through the ruleset importer", async () => {
  installFetchMock();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const { result } = renderHook(() => useEditorController());
  await waitForReady(result.current, result);

  await act(async () => {
    await currentReady(result).controller.applyExpertBaselineSelection({
      version: 1,
      name: "Expert baseline",
      policies: [
        {
          platform: "IOS",
          name: "Expert iOS",
          rules: [
            {
              id: "expert-ios-passcode",
              title: "Expert passcode",
              informational: false,
              mappings: [
                {
                  kind: "relution-native",
                  type: "NATIVE_SINGLE",
                  values: {
                    type: "NATIVE_SINGLE",
                    name: "Expert imported setting",
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  const ready = currentReady(result).controller;
  expect(ready.status).toBe("Applied expert baseline selection");
  expect(ready.rulesetReport?.applied.map((entry) => entry.ruleId)).toEqual(["expert-ios-passcode"]);
  expect(JSON.stringify(ready.state.workspace)).toContain("Expert imported setting");
});

  it("does not claim raw JSON was applied when no configuration is selected", async () => {
    installFetchMock();
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setRawJson(JSON.stringify({ uuid: "CONF-1" }));
    });

    await act(async () => {
      currentReady(result).controller.applyRawJson();
    });

    expect(currentReady(result).controller.status).toBe("Select a configuration before applying raw JSON");
  });

  it("keeps the raw JSON draft across same-entity refreshes", async () => {
    installFetchMock();
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await waitFor(() => {
      expect(currentReady(result).controller.rawJson).toContain("\"CONF-1\"");
    });

    await act(async () => {
      currentReady(result).controller.setRawJson("{\n  \"draft\": true\n}");
    });

    expect(currentReady(result).controller.rawJsonDirty).toBe(true);

    await act(async () => {
      const controller = currentReady(result).controller;
      controller.updateSelectedConfiguration({
        ...(controller.configuration ?? {}),
        details: {
          ...(controller.details ?? {}),
          name: "Server refresh",
        },
      });
    });

    expect(currentReady(result).controller.rawJson).toBe("{\n  \"draft\": true\n}");
    expect(currentReady(result).controller.rawJsonDirty).toBe(true);

    await act(async () => {
      currentReady(result).controller.resetRawJson();
    });

    expect(currentReady(result).controller.rawJson).toContain("\"Server refresh\"");
    expect(currentReady(result).controller.rawJsonDirty).toBe(false);
  });

  it("keeps raw JSON synchronized when the draft is clean", async () => {
    installFetchMock();
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await waitFor(() => {
      expect(currentReady(result).controller.rawJson).toContain("\"Original name\"");
    });

    expect(currentReady(result).controller.rawJsonDirty).toBe(false);

    await act(async () => {
      const controller = currentReady(result).controller;
      controller.updateSelectedConfiguration({
        ...(controller.configuration ?? {}),
        details: {
          ...(controller.details ?? {}),
          name: "Guided change",
        },
      });
    });

    expect(currentReady(result).controller.rawJson).toContain("\"Guided change\"");
    expect(currentReady(result).controller.rawJsonDirty).toBe(false);
  });

  it("marks downloads fresh only after a build and clears freshness on edit", async () => {
    installFetchMock();
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    expect(currentReady(result).controller.hasFreshBuild).toBe(false);

    await act(async () => {
      await currentReady(result).controller.buildArchive();
    });

    expect(currentReady(result).controller.hasFreshBuild).toBe(true);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await act(async () => {
      const controller = currentReady(result).controller;
      controller.updateSelectedConfiguration({
        ...(controller.configuration ?? {}),
        details: {
          ...(controller.details ?? {}),
          name: "Edited after build",
        },
      });
    });

    expect(currentReady(result).controller.hasFreshBuild).toBe(false);
  });

  it("clears fresh-build state after importing a workspace", async () => {
    installFetchMock();
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      await currentReady(result).controller.buildArchive();
    });

    expect(currentReady(result).controller.hasFreshBuild).toBe(true);

    await act(async () => {
      currentReady(result).controller.setImportFile(new File(["test"], "import.rexp", { type: "application/octet-stream" }));
    });

    await act(async () => {
      await currentReady(result).controller.importArchive();
    });

    expect(currentReady(result).controller.hasFreshBuild).toBe(false);
  });

  it("loads recommendation summaries and the active source catalog", async () => {
    installFetchMock(createAppState(), {
      recommendationIndex: createRecommendationIndex(),
      recommendationCatalogs: {
        bsi: createRecommendationCatalog(),
      },
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationIndex?.sources.length).toBe(3);
    });

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationCatalog?.source).toBe("bsi");
    });

    expect(currentReady(result).controller.recommendationPlatform).toBe("IOS");
  });

  it("imports the bundled recommendation ruleset for the selected platform", async () => {
    installFetchMock(createAppState(), {
      recommendationIndex: createRecommendationIndex(),
      recommendationCatalogs: {
        bsi: createRecommendationCatalog(),
      },
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationCatalog?.source).toBe("bsi");
    });

    await act(async () => {
      await currentReady(result).controller.importRecommendationRuleset();
    });

    expect(currentReady(result).controller.inspectorTab).toBe("validation");
    expect(currentReady(result).controller.isDirty).toBe(true);
    expect(currentReady(result).controller.rulesetReport?.applied.length).toBe(1);
    expect(currentReady(result).controller.status).toContain("Imported ruleset BSI Recommendations");
  });

  it("imports only actionable bundled recommendation settings", async () => {
    installFetchMock(createAppState(), {
      recommendationIndex: createRecommendationIndex(),
      recommendationCatalogs: {
        bsi: createRecommendationCatalog({
          ruleset: {
            version: 1,
            name: "BSI Recommendations",
            policies: [
              {
                platform: "IOS",
                name: "iOS BSI Grundschutz",
                rules: [
                  {
                    id: "bsi-ios-informational",
                    title: "Informational evidence",
                    informational: true,
                    mappings: [
                      {
                        kind: "relution-native",
                        type: "NATIVE_SINGLE",
                        values: {
                          type: "NATIVE_SINGLE",
                          name: "Should not be imported",
                        },
                      },
                    ],
                  },
                  {
                    id: "bsi-ios-unmapped",
                    title: "Unmapped evidence",
                  },
                  {
                    id: "bsi-ios-actionable",
                    title: "Actionable setting",
                    mappings: [
                      {
                        kind: "relution-native",
                        type: "NATIVE_MULTI",
                        values: {
                          type: "NATIVE_MULTI",
                          name: "Actionable imported setting",
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      },
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await waitFor(() => {
      expect(currentReady(result).controller.recommendationCatalog?.source).toBe("bsi");
    });

    await act(async () => {
      await currentReady(result).controller.importRecommendationRuleset();
    });

    expect(currentReady(result).controller.rulesetReport?.applied.map((entry) => entry.ruleId)).toEqual(["bsi-ios-actionable"]);
    expect(JSON.stringify(currentReady(result).controller.state.workspace)).not.toContain("Should not be imported");
  });

  it("loads a compliance report when a policy version is selected", async () => {
    installFetchMock(createAppState(), {
      complianceReport: createComplianceReport(),
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await waitFor(() => {
      expect(currentReady(result).controller.complianceReport?.results.length).toBe(1);
    });

    expect(currentReady(result).controller.complianceSources).toEqual(["bsi", "vendor", "cis"]);
    expect(currentReady(result).controller.complianceReport?.results[0]?.status).toBe("exact-gap");
  });

  it("applies an exact compliance remediation and replaces the local workspace with the persisted result", async () => {
    const updatedWorkspace = createWorkspace();
    const document = updatedWorkspace.policies[0]?.document as { versions?: Array<{ configurations?: Array<Record<string, unknown>> }> } | undefined;
    const version = document?.versions?.[0];
    version?.configurations?.push({
      uuid: "CONF-2",
      details: {
        uuid: "DETAIL-2",
        type: "NATIVE_MULTI",
        enforced: true,
      },
    });
    installFetchMock(createAppState(), {
      complianceReport: createComplianceReport(),
      complianceApply: {
        workspace: updatedWorkspace,
        validation: createValidation(),
        sidecar: createSidecar(),
        report: createComplianceReport({
          results: [
            {
              id: "bsi:bsi-native-gap",
              source: "bsi",
              recommendationId: "bsi-native-gap",
              recommendation: createRecommendationCatalog().recommendations[0]!,
              status: "compliant",
              mappingResults: [
                {
                  kind: "relution-native",
                  target: "NATIVE_MULTI",
                  expectedValues: { enforced: true },
                  status: "compliant",
                  matchingConfigurations: [
                    {
                      configurationIndex: 1,
                      type: "NATIVE_MULTI",
                      label: "NATIVE_MULTI",
                    },
                  ],
                  candidateConfigurations: [
                    {
                      configurationIndex: 1,
                      type: "NATIVE_MULTI",
                      label: "NATIVE_MULTI",
                    },
                  ],
                },
              ],
              matchedConfigurations: [
                {
                  configurationIndex: 1,
                  type: "NATIVE_MULTI",
                  label: "NATIVE_MULTI",
                },
              ],
              blockingReasons: [],
              remediationOptions: [],
            },
          ],
          summary: {
            totalRecommendations: 1,
            byStatus: {
              compliant: 1,
              "exact-gap": 0,
              "choice-required": 0,
              "parameter-required": 0,
              "not-checkable": 0,
            },
          },
        }),
      },
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });

    await waitFor(() => {
      expect(currentReady(result).controller.complianceReport?.results[0]?.status).toBe("exact-gap");
    });

    await act(async () => {
      await currentReady(result).controller.applyComplianceRemediation("native-bundle:bsi-native-bundle");
    });

    const ready = currentReady(result).controller;
    const configurations = (((ready.state.workspace.policies[0]?.document.versions as Array<{ configurations?: Array<{ details?: Record<string, unknown> }> }> | undefined)?.[0]?.configurations) ?? []);
    expect(ready.isDirty).toBe(false);
    expect(ready.complianceReport?.results[0]?.status).toBe("compliant");
    expect(configurations.some((entry) => entry.details?.type === "NATIVE_MULTI" && entry.details.enforced === true)).toBe(true);
    expect(ready.status).toContain("Applied compliance remediation");
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBaselineRuleset } from "./baseline-test-fixtures.js";
import { useEditorController } from "./useEditorController.js";
import {
  createAppState,
  createComplianceReport,
  currentReady,
  type FetchRequestRecord,
  installFetchMock,
  waitForReady,
} from "./useEditorController.test-helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useEditorController request intent", () => {
  it("posts the selected compliance remediation request before accepting the persisted response", async () => {
    const requests = installFetchMock(createAppState(), { complianceReport: createComplianceReport() });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });
    await waitFor(() => {
      expect(currentReady(result).controller.complianceReport?.results[0]?.recommendationId).toBe("bsi-native-gap");
    });

    await act(async () => {
      await currentReady(result).controller.applyComplianceRemediation("native-bundle:bsi-native-bundle");
    });

    const body = lastBodyFor(requests, "/api/compliance/apply");
    expect(body).toMatchObject({
      selection: { policyIndex: 0, versionIndex: 0 },
      sources: ["bsi", "vendor", "cis"],
      source: "bsi",
      recommendationId: "bsi-native-gap",
      remediationId: "native-bundle:bsi-native-bundle",
    });
    expect(JSON.stringify(body.workspace)).toContain("Original name");
    expect(currentReady(result).controller.status).toContain("Applied compliance remediation");
  });

  it("posts the current dirty workspace when saving", async () => {
    const requests = installFetchMock();
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
          name: "Saved request body proof",
        },
      });
    });
    await act(async () => {
      await currentReady(result).controller.saveWorkspace();
    });

    const body = lastBodyFor(requests, "/api/workspace");
    expect(JSON.stringify(body.workspace)).toContain("Saved request body proof");
    expect(currentReady(result).controller.status).toBe("Saved workspace");
  });

  it("validates the workspace produced by a baseline import", async () => {
    const requests = installFetchMock();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      await currentReady(result).controller.applyBaselineTemplate({ platform: "IOS", tier: 3, shape: "modules" });
    });

    const body = lastBodyFor(requests, "/api/workspace/validate");
    expect(JSON.stringify(body.workspace)).toContain("Baseline imported setting");
    expect(currentReady(result).controller.status).toBe("Applied baseline template");
  });

  it("validates the workspace produced by an uploaded ruleset import", async () => {
    const requests = installFetchMock();
    const uploadedRuleset = createBaselineRuleset();
    const rulesetForMutation = uploadedRuleset as { policies?: Array<{ rules?: Array<{ mappings?: Array<{ values?: Record<string, unknown> }> }> }> };
    const firstPolicy = rulesetForMutation.policies?.[0];
    const firstMapping = firstPolicy?.rules?.[0]?.mappings?.[0];
    if (firstMapping?.values !== undefined) {
      firstMapping.values.name = "Uploaded ruleset request body proof";
    }
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setRulesetFile(new File([JSON.stringify(uploadedRuleset)], "uploaded-ruleset.json", { type: "application/json" }));
    });
    await act(async () => {
      await currentReady(result).controller.importRuleset();
    });

    const body = lastBodyFor(requests, "/api/workspace/validate");
    expect(JSON.stringify(body.workspace)).toContain("Uploaded ruleset request body proof");
    expect(currentReady(result).controller.status).toBe("Imported ruleset uploaded-ruleset.json");
  });

  it("keeps blocked status when an uploaded ruleset is rejected", async () => {
    const requests = installFetchMock();
    const uploadedRuleset = {
      version: 1,
      name: "Blocked uploaded ruleset",
      policies: [
        {
          platform: "IOS",
          name: "Blocked iOS",
          rules: [
            {
              id: "missing-uploaded-rule",
              title: "Missing uploaded rule",
              mappings: [],
            },
          ],
        },
      ],
    };
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setRulesetFile(new File([JSON.stringify(uploadedRuleset)], "blocked-ruleset.json", { type: "application/json" }));
    });
    await act(async () => {
      await currentReady(result).controller.importRuleset();
    });

    expect(currentReady(result).controller.status).toBe("Ruleset import blocked: 0 conflict(s), 1 unresolved rule(s)");
    expect(currentReady(result).controller.isDirty).toBe(false);
    expect(currentReady(result).controller.rulesetReport?.unresolved.map((entry) => entry.ruleId)).toEqual(["missing-uploaded-rule"]);
    expect(requests.some((request) => request.url === "/api/workspace/validate")).toBe(false);
  });

  it("does not post compliance apply when no policy is selected", async () => {
    const requests = installFetchMock(createAppState(), { complianceReport: createComplianceReport() });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      await currentReady(result).controller.applyComplianceRemediation("native-bundle:bsi-native-bundle");
    });

    expect(currentReady(result).controller.status).toBe("Select a policy before applying compliance remediation");
    expect(requests.filter((request) => request.url === "/api/compliance/apply")).toEqual([]);
  });

  it("keeps compliance apply failures visible when the API rejects the request", async () => {
    const requests = installFetchMock(createAppState(), {
      complianceReport: createComplianceReport(),
      complianceApply: { error: "apply rejected" },
      complianceApplyStatus: 500,
    });
    const { result } = renderHook(() => useEditorController());
    await waitForReady(result.current, result);

    await act(async () => {
      currentReady(result).controller.setSelection({ policyIndex: 0, versionIndex: 0, configurationIndex: 0 });
    });
    await waitFor(() => {
      expect(currentReady(result).controller.complianceReport?.results[0]?.recommendationId).toBe("bsi-native-gap");
    });

    await act(async () => {
      await currentReady(result).controller.applyComplianceRemediation("native-bundle:bsi-native-bundle");
    });

    expect(lastBodyFor(requests, "/api/compliance/apply").remediationId).toBe("native-bundle:bsi-native-bundle");
    expect(currentReady(result).controller.status).toContain("Compliance remediation failed");
    expect(currentReady(result).controller.status).toContain("apply rejected");
  });
});

function lastBodyFor(requests: FetchRequestRecord[], url: string): Record<string, unknown> {
  const matches = requests.filter((request) => request.url === url);
  const body = matches[matches.length - 1]?.body;
  expect(body).toBeDefined();
  return body as Record<string, unknown>;
}

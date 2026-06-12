import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompliancePanel } from "./CompliancePanel.js";
import { createBsiPasscodeRecommendation, createEditorControllerStub } from "./useEditorController.test-helpers.js";

describe("ConfigurationInspector compliance", () => {
  it("renders the compliance viewer and exact remediation action", () => {
    const controller = createEditorControllerStub({
      policy: {
        path: "policies/policy_test.json",
        document: {
          name: "Test Policy",
          platform: "IOS",
        },
      },
      complianceSources: ["bsi", "vendor", "cis"],
      complianceReport: {
        policyPath: "policies/policy_test.json",
        policyName: "Test Policy",
        policyPlatform: "IOS",
        versionIndex: 0,
        sources: ["bsi"],
        sourceStatuses: [
          {
            source: "bsi",
            recommendationCatalog: "loaded",
            settingBundleCatalog: "loaded",
            warnings: [],
          },
        ],
        warnings: [],
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
        results: [
          {
            id: "bsi:bsi-ios-passcode",
            source: "bsi",
            recommendationId: "bsi-ios-passcode",
            recommendation: createBsiPasscodeRecommendation(),
            status: "exact-gap",
            mappingResults: [
              {
                kind: "relution-native",
                target: "IOS_PASSCODE",
                expectedValues: { forcePIN: true },
                status: "missing",
                matchingConfigurations: [],
                candidateConfigurations: [],
              },
            ],
            matchedConfigurations: [],
            blockingReasons: ["Missing IOS_PASSCODE setting"],
            remediationOptions: [
              {
                id: "native-bundle:bsi-ios-passcode",
                kind: "native-bundle",
                label: "Apply IOS_PASSCODE exact bundle",
                coveredRecommendationIds: ["bsi-ios-passcode"],
                surfaces: ["relution-native"],
                bundleId: "bsi-ios-passcode",
                targetType: "IOS_PASSCODE",
              },
            ],
          },
        ],
      },
      complianceLoading: false,
      complianceError: undefined,
      applyComplianceRemediation: vi.fn(async () => {}),
    });

    render(<CompliancePanel controller={controller} />);

    expect(screen.getByRole("heading", { name: /compliance/i })).toBeTruthy();
    expect(screen.getByText(/test policy \| ios/i)).toBeTruthy();
    const sourceGroup = screen.getByRole("group", { name: /compliance sources/i });
    expect(within(sourceGroup).getByRole("button", { name: /^BSI$/i }).getAttribute("aria-pressed")).toBe("true");
    expect(within(sourceGroup).queryByRole("button", { name: /refresh/i })).toBeNull();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /use a strong passcode/i }));
    expect(screen.getByRole("button", { name: /apply ios_passcode exact bundle/i })).toBeTruthy();
    expect(screen.getByText(/terminal fallback/i)).toBeTruthy();
    expect(screen.getByText(/profiles show -type configuration/i)).toBeTruthy();
    expect(screen.getByText(/run a terminal profile check/i)).toBeTruthy();
  });

  it("renders degraded compliance source warnings", () => {
    const controller = createEditorControllerStub({
      policy: {
        path: "policies/policy_test.json",
        document: {
          name: "Test Policy",
          platform: "IOS",
        },
      },
      complianceSources: ["bsi"],
      complianceReport: {
        policyPath: "policies/policy_test.json",
        policyName: "Test Policy",
        policyPlatform: "IOS",
        versionIndex: 0,
        sources: ["bsi"],
        sourceStatuses: [
          {
            source: "bsi",
            recommendationCatalog: "loaded",
            settingBundleCatalog: "degraded",
            warnings: ["bsi setting-bundle catalog unavailable: missing settings catalog fixture"],
          },
        ],
        warnings: ["bsi setting-bundle catalog unavailable: missing settings catalog fixture"],
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
        results: [],
      },
      complianceLoading: false,
      complianceError: undefined,
      toggleComplianceSource: vi.fn(),
      refreshCompliance: vi.fn(async () => {}),
    });

    render(<CompliancePanel controller={controller} />);

    expect(screen.getByText(/bsi setting-bundle catalog unavailable: missing settings catalog fixture/i)).toBeTruthy();
  });

  it("disables unavailable compliance remediation actions", () => {
    const applyComplianceRemediation = vi.fn(async () => {});
    const controller = createEditorControllerStub({
      policy: {
        path: "policies/policy_test.json",
        document: {
          name: "Test Policy",
          platform: "IOS",
        },
      },
      complianceSources: ["vendor"],
      complianceReport: {
        policyPath: "policies/policy_test.json",
        policyName: "Test Policy",
        policyPlatform: "IOS",
        versionIndex: 0,
        sources: ["vendor"],
        warnings: ["vendor setting-bundle catalog unavailable: missing settings catalog fixture"],
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
        results: [
          {
            id: "vendor:vendor-native-gap",
            source: "vendor",
            recommendationId: "vendor-native-gap",
            recommendation: {
              id: "vendor-native-gap",
              platform: "IOS",
              title: "Disable unmanaged service",
              section: "Device restrictions",
              recommendedValue: true,
              reason: "The setting must be enforced.",
              sourceIds: [],
              vendor: {},
              relutionMapping: {
                status: "exact",
                mergeableInImportableRuleset: true,
                candidates: [],
                rulesetMappings: [],
                notes: [],
              },
            },
            status: "exact-gap",
            mappingResults: [
              {
                kind: "relution-native",
                target: "IOS_PASSCODE",
                expectedValues: { forcePIN: true },
                status: "missing",
                matchingConfigurations: [],
                candidateConfigurations: [],
              },
            ],
            matchedConfigurations: [],
            blockingReasons: ["Setting bundle catalog failed to load: missing settings catalog fixture"],
            remediationOptions: [
              {
                id: "recommendation:vendor:vendor-native-gap",
                kind: "exact-recommendation",
                label: "Apply exact mapping for Disable unmanaged service",
                coveredRecommendationIds: ["vendor-native-gap"],
                surfaces: ["relution-native"],
                targetType: "IOS_PASSCODE",
                available: false,
                unavailableReason: "Setting bundle catalog failed to load: missing settings catalog fixture",
              },
            ],
          },
        ],
      },
      complianceLoading: false,
      complianceError: undefined,
      toggleComplianceSource: vi.fn(),
      refreshCompliance: vi.fn(async () => {}),
      applyComplianceRemediation,
    });

    render(<CompliancePanel controller={controller} />);

    fireEvent.click(screen.getByRole("button", { name: /disable unmanaged service/i }));
    const applyButton = screen.getByRole("button", { name: /apply exact mapping for disable unmanaged service/i }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
    expect(applyButton.title).toContain("Setting bundle catalog failed to load");
    fireEvent.click(applyButton);
    expect(applyComplianceRemediation).not.toHaveBeenCalled();
  });

  it("disables the final active compliance source instead of silently ignoring it", () => {
    const controller = createEditorControllerStub({
      inspectorTab: "validation",
      setInspectorTab: vi.fn(),
      status: "",
      isDirty: false,
      rulesetReport: undefined,
      policy: {
        path: "policies/policy_test.json",
        document: {
          name: "Test Policy",
          platform: "IOS",
        },
      },
      complianceSources: ["bsi"],
      complianceReport: undefined,
      complianceLoading: false,
      complianceError: undefined,
      toggleComplianceSource: vi.fn(),
      refreshCompliance: vi.fn(async () => {}),
    });

    render(<CompliancePanel controller={controller} />);

    const bsiButton = within(screen.getByRole("group", { name: /compliance sources/i })).getByRole("button", { name: /^BSI$/i }) as HTMLButtonElement;
    expect(bsiButton.disabled).toBe(true);
    expect(bsiButton.getAttribute("aria-pressed")).toBe("true");
    expect(bsiButton.title).toMatch(/at least one compliance source/i);
  });
});

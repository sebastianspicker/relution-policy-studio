import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompliancePanel } from "./CompliancePanel.js";
import { createEditorControllerStub } from "./useEditorController.test-helpers.js";

describe("ConfigurationInspector compliance", () => {
  it("renders the compliance viewer and exact remediation action", () => {
    const controller = createEditorControllerStub({
      inspectorTab: "validation",
      setInspectorTab: vi.fn(),
      status: "",
      isDirty: false,
      rulesetReport: undefined,
      details: undefined,
      configuration: undefined,
      rawJson: "{}",
      rawJsonDirty: false,
      setRawJson: vi.fn(),
      resetRawJson: vi.fn(),
      applyRawJson: vi.fn(),
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
            recommendation: {
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
      toggleComplianceSource: vi.fn(),
      refreshCompliance: vi.fn(async () => {}),
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

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigurationInspector } from "./ConfigurationInspector.js";
import { RecommendationsPanel } from "./RecommendationsPanel.js";
import { createEditorControllerStub } from "./useEditorController.test-helpers.js";

describe("ConfigurationInspector", () => {
  it("exposes inspector tabs and raw JSON to assistive technology", () => {
    const controller = createEditorControllerStub({
      inspectorTab: "json",
      setInspectorTab: vi.fn(),
      status: "Saved workspace",
      isDirty: false,
      rulesetReport: undefined,
      details: { type: "NATIVE_SINGLE" },
      configuration: { uuid: "CONF-1" },
      rawJson: "{\n  \"uuid\": \"CONF-1\"\n}",
      rawJsonDirty: false,
      setRawJson: vi.fn(),
      resetRawJson: vi.fn(),
      applyRawJson: vi.fn(),
    });

    render(<ConfigurationInspector controller={controller} />);

    const rawJsonTab = screen.getByRole("tab", { name: /raw json/i });
    expect(rawJsonTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(rawJsonTab.id);
    expect(screen.getByLabelText(/configuration raw json/i)).toBeTruthy();
  });

  it("does not render a status region inside the inspector (status lives in StatusBar)", () => {
    const controller = createEditorControllerStub({
      inspectorTab: "validation",
      setInspectorTab: vi.fn(),
      status: "Save failed: validation error",
      isDirty: false,
      rulesetReport: undefined,
    });

    render(<ConfigurationInspector controller={controller} />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("disables raw JSON apply when no configuration is selected", () => {
    const controller = createEditorControllerStub({
      inspectorTab: "json",
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
    });

    render(<ConfigurationInspector controller={controller} />);

    expect((screen.getByRole("button", { name: /apply json/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a reset control and dirty warning when raw JSON diverges", () => {
    const controller = createEditorControllerStub({
      inspectorTab: "json",
      setInspectorTab: vi.fn(),
      status: "",
      isDirty: false,
      rulesetReport: undefined,
      details: { type: "NATIVE_SINGLE" },
      configuration: { uuid: "CONF-1" },
      rawJson: "{\n  \"draft\": true\n}",
      rawJsonDirty: true,
      setRawJson: vi.fn(),
      resetRawJson: vi.fn(),
      applyRawJson: vi.fn(),
    });

    render(<ConfigurationInspector controller={controller} />);

    expect(screen.getByText(/raw json draft differs from the live configuration/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /reset json/i }));

    expect(controller.resetRawJson).toHaveBeenCalledTimes(1);
  });

  it("shows recommendation source tabs and selected recommendation details", () => {
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
      recommendationSource: "bsi",
      recommendationIndex: {
        sources: [
          {
            source: "bsi",
            label: "BSI",
            available: true,
            verifiedAsOf: "2026-04-23",
            recommendationCount: 1,
            displayPlatforms: ["IOS"],
            importPlatforms: ["IOS"],
            displayToImportPlatform: { IOS: "IOS" },
          },
        ],
      },
      recommendationCatalog: {
        source: "bsi",
        label: "BSI",
        available: true,
        verifiedAsOf: "2026-04-23",
        recommendationCount: 1,
        displayPlatforms: ["IOS"],
        importPlatforms: ["IOS"],
        displayToImportPlatform: { IOS: "IOS" },
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
              candidates: [],
              rulesetMappings: [
                {
                  kind: "relution-native",
                  type: "IOS_PASSCODE",
                  values: { requirePasscode: true },
                },
              ],
              notes: [],
            },
          },
        ],
        ruleset: {
          version: 1,
          name: "BSI Recommendations",
          policies: [{ platform: "IOS", name: "iOS BSI Grundschutz", rules: [] }],
        },
      },
      recommendationQuery: "",
      recommendationPlatform: "IOS",
      selectedRecommendationId: "bsi-ios-passcode",
      recommendationsLoading: false,
      recommendationsError: undefined,
      setRecommendationSource: vi.fn(),
      setRecommendationQuery: vi.fn(),
      setRecommendationPlatform: vi.fn(),
      setSelectedRecommendationId: vi.fn(),
      importRecommendationRuleset: vi.fn(async () => {}),
    });

    render(<RecommendationsPanel controller={controller} />);

    expect(screen.getByRole("heading", { name: /recommendations/i })).toBeTruthy();
    const bsiSourceTab = screen.getByRole("tab", { name: /^BSI$/i });
    expect(bsiSourceTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: /^BSI$/i })).toBeTruthy();
    expect(screen.getByText(/SYS\.1\.A1/i)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: /use a strong passcode/i })).toBeTruthy();
    expect(screen.getByText(/relution mapping/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /import actionable settings/i })).toBeTruthy();
  });

  it("shows generated importability from implementation metadata instead of the legacy merge flag", () => {
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
      recommendationSource: "vendor",
      recommendationIndex: {
        sources: [
          {
            source: "vendor",
            label: "Vendor",
            available: true,
            verifiedAsOf: "2026-04-23",
            recommendationCount: 1,
            displayPlatforms: ["ANDROID"],
            importPlatforms: ["ANDROID_ENTERPRISE"],
            displayToImportPlatform: { ANDROID: "ANDROID_ENTERPRISE" },
            coverageSummary: {
              exactMappings: 1,
              actionableRecommendations: 1,
              partialRecommendations: 0,
              helperOnlyRecommendations: 0,
              gapRecommendations: 0,
            },
          },
        ],
      },
      recommendationCatalog: {
        source: "vendor",
        label: "Vendor",
        available: true,
        verifiedAsOf: "2026-04-23",
        recommendationCount: 1,
        displayPlatforms: ["ANDROID"],
        importPlatforms: ["ANDROID_ENTERPRISE"],
        displayToImportPlatform: { ANDROID: "ANDROID_ENTERPRISE" },
        recommendations: [
          {
            id: "android-ota",
            platform: "ANDROID",
            sourceIds: ["google-android-enterprise-system-updates"],
            title: "Offer automatic OTA system updates",
            section: "System update policy",
            recommendedValue: "AUTOMATIC",
            reason: "Use automatic OTA updates.",
            vendor: {},
            implementation: {
              category: "relution-achievable",
              surfaces: ["relution-native"],
              importableVia: ["ruleset-import", "apply-json"],
              blockingReasons: [],
            },
            relutionMapping: {
              status: "exact",
              mergeableInImportableRuleset: false,
              candidates: [],
              rulesetMappings: [
                {
                  kind: "relution-native",
                  type: "ANDROID_ENTERPRISE_SYSTEM_UPDATE",
                  values: { systemUpdateType: "AUTOMATIC" },
                },
              ],
              notes: [],
            },
          },
        ],
        ruleset: {
          version: 1,
          name: "Vendor Recommendations",
          policies: [{ platform: "ANDROID_ENTERPRISE", name: "Android Vendor", rules: [] }],
        },
      },
      recommendationQuery: "",
      recommendationPlatform: "ANDROID",
      selectedRecommendationId: undefined,
      recommendationsLoading: false,
      recommendationsError: undefined,
      setRecommendationSource: vi.fn(),
      setRecommendationQuery: vi.fn(),
      setRecommendationPlatform: vi.fn(),
      setSelectedRecommendationId: vi.fn(),
      importRecommendationRuleset: vi.fn(async () => {}),
    });

    render(<RecommendationsPanel controller={controller} />);

    expect(screen.getByText(/importable via ruleset-import, apply-json/i)).toBeTruthy();
    expect(screen.queryByText(/^Info only$/i)).toBeNull();
  });

  it("renders CIS fallback methods and keeps exact-mapped fallback sections collapsed by default", () => {
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
      recommendationSource: "cis",
      recommendationIndex: {
        sources: [
          {
            source: "cis",
            label: "CIS",
            available: true,
            verifiedAsOf: "2026-04-23",
            recommendationCount: 1,
            displayPlatforms: ["MACOS"],
            importPlatforms: ["MACOS"],
            displayToImportPlatform: { MACOS: "MACOS" },
          },
        ],
      },
      recommendationCatalog: {
        source: "cis",
        label: "CIS",
        available: true,
        verifiedAsOf: "2026-04-23",
        recommendationCount: 1,
        displayPlatforms: ["MACOS"],
        importPlatforms: ["MACOS"],
        displayToImportPlatform: { MACOS: "MACOS" },
        recommendations: [
          {
            id: "cis-macos-software-update",
            platform: "MACOS",
            osFamily: "MACOS",
            benchmarkId: "cis-apple-macos-26-tahoe-1-0-0",
            benchmarkTitle: "CIS Apple macOS 26 Tahoe Benchmark",
            benchmarkVersion: "1.0.0",
            benchmarkDate: "2026-03-06",
            managementSurface: "APPLE_CONFIGURATION_PROFILE",
            sourcePdfPath: "example/cis-references/downloads/pdf/CIS_Apple_macOS_26_Tahoe_Benchmark_v1.0.0.pdf",
            familySourceId: "cis-apple-macos-family",
            sourceIds: ["cis-apple-macos-26-tahoe-1-0-0"],
            recommendationId: "1.2",
            title: "Ensure Download New Updates When Available Is Enabled",
            assessmentStatus: "Automated",
            profileApplicability: ["Level 1"],
            description: "Enable automatic downloads.",
            rationale: "Security updates should arrive quickly.",
            impact: "",
            audit: "Use the UI.",
            remediation: "Use a profile or terminal command.",
            defaultValue: "Disabled",
            additionalInformation: "",
            references: [],
            recommendedValue: "Enabled",
            helperFallbacks: [
              {
                id: "terminal-remediation",
                role: "remediation",
                method: "terminal",
                title: "Terminal Method",
                rawText: "Run defaults write.",
                commands: ["/usr/bin/sudo /usr/bin/defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload -bool true"],
              },
              {
                id: "profile-remediation",
                role: "remediation",
                method: "profile-method",
                title: "Profile Method",
                rawText: "Create a com.apple.SoftwareUpdate profile.",
                commands: [],
                profilePayloadType: "com.apple.SoftwareUpdate",
                profileKeys: [
                  {
                    key: "AutomaticDownload",
                    value: "<true/>",
                  },
                ],
              },
            ],
            relutionMapping: {
              status: "exact",
              mergeableInImportableRuleset: true,
              candidates: [],
              rulesetMappings: [
                {
                  kind: "apple-mobileconfig",
                  payloadType: "com.apple.SoftwareUpdate",
                  values: { AutomaticDownload: true },
                },
              ],
              notes: [],
            },
          },
        ],
        ruleset: {
          version: 1,
          name: "CIS Recommendations",
          policies: [{ platform: "MACOS", name: "macOS CIS", rules: [] }],
        },
      },
      recommendationQuery: "",
      recommendationPlatform: "MACOS",
      selectedRecommendationId: "cis-macos-software-update",
      recommendationsLoading: false,
      recommendationsError: undefined,
      setRecommendationSource: vi.fn(),
      setRecommendationQuery: vi.fn(),
      setRecommendationPlatform: vi.fn(),
      setSelectedRecommendationId: vi.fn(),
      importRecommendationRuleset: vi.fn(async () => {}),
    });

    render(<RecommendationsPanel controller={controller} />);

    const fallbackDetails = screen.getByText(/secondary only/i).closest("details") as HTMLDetailsElement | null;
    expect(fallbackDetails).toBeTruthy();
    expect(fallbackDetails?.open).toBe(false);
    const fallbackScope = within(fallbackDetails as HTMLDetailsElement);
    expect(fallbackScope.getByText(/payloadtype:/i)).toBeTruthy();
    expect(fallbackScope.getByText(/automaticdownload: <true\/>/i)).toBeTruthy();
  });

  it("expands CIS fallback methods by default when there is no exact Relution mapping", () => {
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
      recommendationSource: "cis",
      recommendationIndex: {
        sources: [
          {
            source: "cis",
            label: "CIS",
            available: true,
            verifiedAsOf: "2026-04-23",
            recommendationCount: 1,
            displayPlatforms: ["WINDOWS"],
            importPlatforms: ["WINDOWS"],
            displayToImportPlatform: { WINDOWS: "WINDOWS" },
          },
        ],
      },
      recommendationCatalog: {
        source: "cis",
        label: "CIS",
        available: true,
        verifiedAsOf: "2026-04-23",
        recommendationCount: 1,
        displayPlatforms: ["WINDOWS"],
        importPlatforms: ["WINDOWS"],
        displayToImportPlatform: { WINDOWS: "WINDOWS" },
        recommendations: [
          {
            id: "cis-windows-audit-policy",
            platform: "WINDOWS",
            osFamily: "WINDOWS",
            benchmarkId: "cis-microsoft-windows-11-standalone-5-0-0",
            benchmarkTitle: "CIS Microsoft Windows 11 Stand-alone Benchmark",
            benchmarkVersion: "5.0.0",
            benchmarkDate: "2026-03-25",
            managementSurface: "WINDOWS_STANDALONE",
            sourcePdfPath: "example/cis-references/downloads/pdf/CIS_Microsoft_Windows_11_Stand-alone_Benchmark_v5.0.0.pdf",
            familySourceId: "cis-windows-desktop-family",
            sourceIds: ["cis-microsoft-windows-11-standalone-5-0-0"],
            recommendationId: "17.1.1",
            title: "Ensure Audit Credential Validation is set",
            assessmentStatus: "Automated",
            profileApplicability: ["Level 1"],
            description: "Audit credential validation.",
            rationale: "Need account-logon auditing.",
            impact: "",
            audit: "auditpol /get /subcategory:\"{0cce923f-69ae-11d9-bed3-505054503030}\"",
            remediation: "Use group policy.",
            defaultValue: "No Auditing",
            additionalInformation: "",
            references: [],
            recommendedValue: "Success and Failure",
            helperFallbacks: [
              {
                id: "audit-command",
                role: "audit",
                method: "auditpol",
                title: "auditpol.exe",
                rawText: "Use auditpol.exe.",
                commands: ['auditpol /get /subcategory:"{0cce923f-69ae-11d9-bed3-505054503030}"'],
              },
              {
                id: "gp-path",
                role: "remediation",
                method: "group-policy-path",
                title: "Group Policy",
                rawText: "Set the UI path.",
                commands: [],
                groupPolicyPaths: [
                  "Computer Configuration\\Policies\\Windows Settings\\Security Settings\\Advanced Audit Policy Configuration\\Audit Policies\\Account Logon\\Audit Credential Validation",
                ],
              },
            ],
            relutionMapping: {
              status: "none",
              mergeableInImportableRuleset: false,
              candidates: [],
              rulesetMappings: [],
              notes: [],
            },
          },
        ],
        ruleset: {
          version: 1,
          name: "CIS Recommendations",
          policies: [{ platform: "WINDOWS", name: "Windows CIS", rules: [] }],
        },
      },
      recommendationQuery: "",
      recommendationPlatform: "WINDOWS",
      selectedRecommendationId: "cis-windows-audit-policy",
      recommendationsLoading: false,
      recommendationsError: undefined,
      setRecommendationSource: vi.fn(),
      setRecommendationQuery: vi.fn(),
      setRecommendationPlatform: vi.fn(),
      setSelectedRecommendationId: vi.fn(),
      importRecommendationRuleset: vi.fn(async () => {}),
    });

    render(<RecommendationsPanel controller={controller} />);

    const fallbackDetails = screen.getByText(/fallback methods/i).closest("details") as HTMLDetailsElement | null;
    expect(fallbackDetails).toBeTruthy();
    expect(fallbackDetails?.open).toBe(true);
    const fallbackScope = within(fallbackDetails as HTMLDetailsElement);
    expect(fallbackScope.getByText(/^auditpol\.exe$/i)).toBeTruthy();
    expect(fallbackScope.getByText(/advanced audit policy configuration/i)).toBeTruthy();
  });

});

import type { BaselineExpertOptionsResponse, BaselineTemplateOptionsResponse } from "../../../src/baseline-templates.js";

export function createBaselineExpertOptions(): BaselineExpertOptionsResponse {
  return {
    version: 1,
    format: "relution-baseline-expert",
    platform: "IOS",
    shape: "modules",
    tiers: [1, 2, 3],
    tierCoverage: [
      { tier: 1, totalSettings: 4 },
      { tier: 2, totalSettings: 3 },
      { tier: 3, totalSettings: 3 },
    ],
    settings: [
      {
        id: "relution-native:APPLE_DEVICE_SETTINGS",
        label: "APPLE_DEVICE_SETTINGS",
        policyName: "iOS Tier 1 Baseline - Apple Device Settings",
        ruleId: "baseline-ios-activation-lock",
        ruleTitle: "Activation Lock",
        reason: "Exact CIS baseline setting",
        requiredInTiers: [1],
        tierMappings: [
          {
            tier: 1,
            policyName: "iOS Tier 1 Baseline - Apple Device Settings",
            ruleId: "baseline-ios-activation-lock",
            ruleTitle: "Activation Lock",
            reason: "Exact CIS baseline setting",
            recommendations: [
              { source: "cis", ruleId: "cis-ios-activation-lock", title: "Enable Activation Lock", reason: "Exact mapping", sourceIds: ["source-cis"] },
            ],
            mappings: [{ kind: "relution-native", target: "APPLE_DEVICE_SETTINGS", type: "APPLE_DEVICE_SETTINGS", values: { allowActivationLock: true } }],
          },
        ],
        recommendations: [
          { source: "cis", ruleId: "cis-ios-activation-lock", title: "Enable Activation Lock", reason: "Exact mapping", sourceIds: ["source-cis"] },
        ],
      },
      {
        id: "relution-native:IOS_PASSCODE",
        label: "IOS_PASSCODE",
        policyName: "iOS Tier 1 Baseline - iOS Passcode",
        ruleId: "baseline-ios-passcode",
        ruleTitle: "Baseline passcode",
        reason: "Exact baseline setting",
        requiredInTiers: [1, 2, 3],
        tierMappings: [
          tierMapping("iOS Tier 1 Baseline - iOS Passcode", "IOS_PASSCODE", { forcePIN: true, minLength: 8 }, "bsi-ios-passcode", "Use a strong passcode", 1),
          tierMapping("iOS Tier 2 Baseline - iOS Passcode", "IOS_PASSCODE", { forcePIN: true, minLength: 8 }, "bsi-ios-passcode", "Use a strong passcode", 2),
          tierMapping("iOS Tier 3 Baseline - iOS Passcode", "IOS_PASSCODE", { forcePIN: true, minLength: 8 }, "bsi-ios-passcode", "Use a strong passcode", 3),
        ],
        recommendations: [
          { source: "bsi", ruleId: "bsi-ios-passcode", title: "Use a strong passcode", reason: "Exact mapping", sourceIds: ["source-bsi"] },
        ],
      },
      {
        id: "relution-native:IOS_RESTRICTION",
        label: "IOS_RESTRICTION",
        policyName: "iOS Tier 1 Baseline - iOS Restriction",
        ruleId: "baseline-ios-restriction",
        ruleTitle: "Baseline restrictions",
        reason: "Exact baseline setting",
        requiredInTiers: [1, 2, 3],
        tierMappings: [
          {
            ...tierMapping("iOS Tier 1 Baseline - iOS Restriction", "IOS_RESTRICTION", { allowCloudBackup: false, allowFingerprintForUnlock: false }, "bsi-ios-restriction", "Apply iOS restrictions", 1),
            recommendations: [
              { source: "bsi", ruleId: "bsi-ios-restriction", title: "Apply iOS restrictions", reason: "Exact mapping", sourceIds: ["source-bsi"] },
              { source: "cis", ruleId: "cis-ios-restriction", title: "Apply CIS restrictions", reason: "Exact mapping", sourceIds: ["source-cis"] },
            ],
          },
          {
            ...tierMapping("iOS Tier 2 Baseline - iOS Restriction", "IOS_RESTRICTION", { allowCloudBackup: false, allowFingerprintForUnlock: false }, "bsi-ios-restriction", "Apply iOS restrictions", 2),
            recommendations: [
              { source: "bsi", ruleId: "bsi-ios-restriction", title: "Apply iOS restrictions", reason: "Exact mapping", sourceIds: ["source-bsi"] },
              { source: "cis", ruleId: "cis-ios-restriction", title: "Apply CIS restrictions", reason: "Exact mapping", sourceIds: ["source-cis"] },
            ],
          },
          tierMapping("iOS Tier 3 Baseline - iOS Restriction", "IOS_RESTRICTION", { allowCloudBackup: false }, "bsi-ios-restriction", "Apply iOS restrictions", 3),
        ],
        recommendations: [
          { source: "bsi", ruleId: "bsi-ios-restriction", title: "Apply iOS restrictions", reason: "Exact mapping", sourceIds: ["source-bsi"] },
          { source: "cis", ruleId: "cis-ios-restriction", title: "Apply CIS restrictions", reason: "Exact mapping", sourceIds: ["source-cis"] },
        ],
      },
      {
        id: "relution-native:IOS_UPDATE",
        label: "IOS_UPDATE",
        policyName: "iOS Tier 1 Baseline - iOS Update",
        ruleId: "baseline-ios-update",
        ruleTitle: "Baseline updates",
        reason: "Exact baseline setting",
        requiredInTiers: [1, 2, 3],
        tierMappings: [
          tierMapping("iOS Tier 1 Baseline - iOS Update", "IOS_UPDATE", { updateMode: "INSTALL_ASAP" }, "bsi-ios-update", "Install updates promptly", 1),
          tierMapping("iOS Tier 2 Baseline - iOS Update", "IOS_UPDATE", { updateMode: "INSTALL_ASAP" }, "bsi-ios-update", "Install updates promptly", 2),
          tierMapping("iOS Tier 3 Baseline - iOS Update", "IOS_UPDATE", { updateMode: "INSTALL_ASAP" }, "bsi-ios-update", "Install updates promptly", 3),
        ],
        recommendations: [
          { source: "bsi", ruleId: "bsi-ios-update", title: "Install updates promptly", reason: "Exact mapping", sourceIds: ["source-bsi"] },
        ],
      },
    ],
  };
}

export function createBaselineTemplateOptions(): BaselineTemplateOptionsResponse {
  return {
    version: 1,
    format: "relution-ruleset-json",
    platforms: ["IOS"],
    shapes: ["modules", "full"],
    tiers: [1, 2, 3],
    options: [
      baselineTemplateOption(3, "modules", 3, "Tier 3 - minimum secure BSI Basis baseline", "basis", ["Classroom devices", "Student devices"]),
      baselineTemplateOption(2, "modules", 3, "Tier 2 - strengthened BSI baseline", "standard-hardening", ["Staff devices", "Faculty devices"]),
      baselineTemplateOption(1, "modules", 4, "Tier 1 - most restrictive Grundschutz baseline", "grundschutz", ["Administration", "Exam devices"]),
      baselineTemplateOption(3, "full", 1, "Tier 3 - minimum secure BSI Basis baseline", "basis", ["Classroom devices", "Student devices"]),
    ],
  };
}

export function createBaselineRuleset(): Record<string, unknown> {
  return {
    version: 1,
    name: "iOS Tier 3 Baseline",
    baselineTemplate: {
      version: 1,
      kind: "tiered-modular-platform",
      platform: "IOS",
      tier: 3,
    },
    policies: [
      {
        platform: "IOS",
        name: "iOS Tier 3 Baseline",
        rules: [
          {
            id: "baseline-ios-passcode",
            title: "Baseline passcode",
            mappings: [
              {
                kind: "relution-native",
                type: "NATIVE_SINGLE",
                values: {
                  type: "NATIVE_SINGLE",
                  name: "Baseline imported setting",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function tierMapping(policyName: string, type: string, values: Record<string, unknown>, ruleId: string, title: string, tier: 1 | 2 | 3): BaselineExpertOptionsResponse["settings"][number]["tierMappings"][number] {
  return {
    tier,
    policyName,
    ruleId: "baseline-ios-" + type.toLowerCase().replace("ios_", ""),
    ruleTitle: policyName.includes("Restriction") ? "Baseline restrictions" : policyName.includes("Update") ? "Baseline updates" : "Baseline passcode",
    reason: "Exact baseline setting",
    recommendations: [
      { source: "bsi", ruleId, title, reason: "Exact mapping", sourceIds: ["source-bsi"] },
    ],
    mappings: [{ kind: "relution-native", target: type, type, values }],
  };
}

function baselineTemplateOption(
  tier: 1 | 2 | 3,
  shape: "modules" | "full",
  count: number,
  tierLabel: string,
  securityLevel: string,
  stakeholderExamples: readonly string[],
): BaselineTemplateOptionsResponse["options"][number] {
  return {
    platform: "IOS",
    tier,
    shape,
    tierLabel,
    securityLevel,
    sourcePolicy: "bsi-cis-vendor",
    coverage: "distinct",
    policyCount: count,
    ruleCount: count,
    actionableRuleCount: count,
    informationalRuleCount: 0,
    suppressedConflictRuleCount: 0,
    stakeholderExamples,
  };
}

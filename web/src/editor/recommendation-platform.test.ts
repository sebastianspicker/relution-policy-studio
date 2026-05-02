import { describe, expect, it } from "vitest";
import type { RecommendationRuleset } from "../../../src/recommendation-types.js";
import { filterActionableRecommendationRuleset, filterRecommendationRuleset } from "./recommendation-platform.js";

describe("recommendation-platform", () => {
  it("keeps the full recommendation ruleset when only platform filtering is requested", () => {
    const ruleset = createRuleset();

    const filtered = filterRecommendationRuleset(ruleset, "IOS");

    expect(filtered.policies).toHaveLength(1);
    expect(filtered.policies[0]?.rules.map((rule) => rule.id)).toEqual(["informational", "unmapped", "mapped"]);
  });

  it("derives an actionable import ruleset without informational or unmapped rules", () => {
    const ruleset = createRuleset();

    const filtered = filterActionableRecommendationRuleset(ruleset, "IOS");

    expect(filtered.policies).toHaveLength(1);
    expect(filtered.policies[0]?.platform).toBe("IOS");
    expect(filtered.policies[0]?.rules.map((rule) => rule.id)).toEqual(["mapped"]);
  });

  it("drops empty policies after action-only filtering", () => {
    const ruleset = createRuleset();

    const filtered = filterActionableRecommendationRuleset(ruleset, "MACOS");

    expect(filtered.policies).toEqual([]);
  });
});

function createRuleset(): RecommendationRuleset {
  return {
    version: 1,
    name: "Recommendation rules",
    policies: [
      {
        platform: "IOS",
        name: "iOS",
        rules: [
          {
            id: "informational",
            title: "Informational recommendation",
            informational: true,
            mappings: [
              {
                kind: "relution-native",
                type: "IOS_INFO",
                values: { enabled: true },
              },
            ],
          },
          {
            id: "unmapped",
            title: "Unmapped recommendation",
          },
          {
            id: "mapped",
            title: "Mapped recommendation",
            informational: false,
            mappings: [
              {
                kind: "relution-native",
                type: "IOS_PASSCODE",
                values: { requirePasscode: true },
              },
            ],
          },
        ],
      },
      {
        platform: "MACOS",
        name: "macOS",
        rules: [
          {
            id: "macos-informational",
            title: "macOS evidence",
            informational: true,
          },
        ],
      },
    ],
  };
}

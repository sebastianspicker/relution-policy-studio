import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BsiRecommendationRecord } from "../../../src/recommendation-types.js";
import { RecommendationsPanel } from "./RecommendationsPanel.js";
import { createEditorControllerStub, createRecommendationCatalog } from "./useEditorController.test-helpers.js";

describe("RecommendationsPanel", () => {
  it("separates actionable settings from recommendations without generated settings", () => {
    const exact = createRecommendationCatalog().recommendations[0] as BsiRecommendationRecord;
    const evidence: BsiRecommendationRecord = {
      ...exact,
      id: "bsi-ios-manual-review",
      requirementId: "SYS.1.A2",
      title: "Review unmanaged device exceptions",
      requirementText: "Review unmanaged device exceptions.",
      reason: "Some recommendations need organizational context.",
      paragraphs: ["Review unmanaged device exceptions."],
      implementation: {
        category: "relution-partial",
        surfaces: ["helper"],
        importableVia: [],
        blockingReasons: ["Requires local exception policy."],
      },
      relutionMapping: {
        status: "partial",
        mergeableInImportableRuleset: false,
        candidates: [
          {
            kind: "helper",
            target: "manual-review",
            fieldPaths: ["exceptionPolicy"],
          },
        ],
        rulesetMappings: [],
        notes: ["Requires local exception policy."],
      },
    };
    const controller = createEditorControllerStub({
      inspectorTab: "validation",
      recommendationSource: "bsi",
      recommendationIndex: {
        sources: [
          {
            source: "bsi",
            label: "BSI",
            available: true,
            verifiedAsOf: "2026-04-23",
            recommendationCount: 2,
            displayPlatforms: ["IOS"],
            importPlatforms: ["IOS"],
            displayToImportPlatform: { IOS: "IOS" },
          },
        ],
      },
      recommendationCatalog: createRecommendationCatalog({
        recommendationCount: 2,
        displayPlatforms: ["IOS"],
        importPlatforms: ["IOS"],
        displayToImportPlatform: { IOS: "IOS" },
        recommendations: [exact, evidence],
      }),
      recommendationPlatform: "IOS",
      setRecommendationSource: vi.fn(),
      setRecommendationQuery: vi.fn(),
      setRecommendationPlatform: vi.fn(),
      setSelectedRecommendationId: vi.fn(),
      importRecommendationRuleset: vi.fn(async () => undefined),
    });

    render(<RecommendationsPanel controller={controller} />);

    expect(screen.getByText(/use a strong passcode/i)).toBeTruthy();
    expect(screen.queryByText(/review unmanaged device exceptions/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/scope/i), {
      target: { value: "recommendations-without-settings" },
    });

    expect(screen.queryByText(/use a strong passcode/i)).toBeNull();
    expect(screen.getByText(/review unmanaged device exceptions/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/scope/i), {
      target: { value: "all-recommendations" },
    });

    expect(screen.getByText(/use a strong passcode/i)).toBeTruthy();
    expect(screen.getByText(/review unmanaged device exceptions/i)).toBeTruthy();
  });
});

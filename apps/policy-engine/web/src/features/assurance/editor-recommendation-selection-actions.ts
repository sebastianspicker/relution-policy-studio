/** Coordinates recommendation-source and compliance-source selection state. */
import type { Dispatch, SetStateAction } from "react";
import type { RecommendationIndexResponse, RecommendationSource } from "../../../../src/browser/assurance.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import {
  ALL_RECOMMENDATION_PLATFORMS,
  policyPlatform,
  preferredRecommendationPlatform,
} from "../../shared/recommendation-platform.js";

interface RecommendationSelectionInput {
  readonly policy: WorkspacePolicy | undefined;
  readonly recommendationIndex: RecommendationIndexResponse | undefined;
  readonly setRecommendationSourceState: Dispatch<SetStateAction<RecommendationSource>>;
  readonly setRecommendationPlatform: Dispatch<SetStateAction<string>>;
  readonly setRecommendationQuery: Dispatch<SetStateAction<string>>;
  readonly setSelectedRecommendationId: Dispatch<SetStateAction<string | undefined>>;
  readonly setComplianceSources: Dispatch<SetStateAction<RecommendationSource[]>>;
}

export function createRecommendationSelectionActions(input: RecommendationSelectionInput): {
  readonly setRecommendationSource: (value: RecommendationSource) => void;
  readonly toggleComplianceSource: (value: RecommendationSource) => void;
} {
  function setRecommendationSource(value: RecommendationSource): void {
    input.setRecommendationSourceState(value);
    const summary = input.recommendationIndex?.sources.find((candidate) => candidate.source === value);
    const preferred = summary === undefined
      ? ALL_RECOMMENDATION_PLATFORMS
      : preferredRecommendationPlatform(summary, policyPlatform(input.policy));
    input.setRecommendationPlatform(preferred ?? ALL_RECOMMENDATION_PLATFORMS);
    input.setRecommendationQuery("");
    input.setSelectedRecommendationId(undefined);
  }

  function toggleComplianceSource(value: RecommendationSource): void {
    input.setComplianceSources((current) => current.includes(value)
      ? (current.length === 1 ? current : current.filter((entry) => entry !== value))
      : [...current, value]);
  }

  return { setRecommendationSource, toggleComplianceSource };
}

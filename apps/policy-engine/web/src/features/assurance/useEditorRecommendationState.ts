/** Owns recommendation catalog state independently from workspace mutations. */
import { useState } from "react";
import type {
  RecommendationBrowseResponse,
  RecommendationIndexResponse,
  RecommendationSource,
} from "../../../../src/browser/assurance.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import type { EditorRecommendationState } from "./editor-recommendation-state-contract.js";
import { ALL_RECOMMENDATION_PLATFORMS } from "../../shared/recommendation-platform.js";
import { useRecommendationData } from "./useEditorRecommendationData.js";

export type { EditorRecommendationState } from "./editor-recommendation-state-contract.js";

/** Keeps recommendation data independent from policy mutations and selection churn. */
export function useRecommendationState(props: {
  readonly policy: WorkspacePolicy | undefined;
}): EditorRecommendationState {
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [recommendationIndex, setRecommendationIndex] = useState<RecommendationIndexResponse | undefined>();
  const [recommendationCatalogs, setRecommendationCatalogs] = useState<Partial<Record<RecommendationSource, RecommendationBrowseResponse>>>({});
  const [recommendationSource, setRecommendationSourceState] = useState<RecommendationSource>("bsi");
  const [recommendationQuery, setRecommendationQuery] = useState("");
  const [recommendationPlatform, setRecommendationPlatform] = useState(ALL_RECOMMENDATION_PLATFORMS);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | undefined>();
  const [recommendationIndexLoading, setRecommendationIndexLoading] = useState(false);
  const [recommendationCatalogLoading, setRecommendationCatalogLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | undefined>();
  const recommendationCatalog = recommendationCatalogs[recommendationSource];
  const recommendationSummary = recommendationIndex?.sources.find((candidate) => candidate.source === recommendationSource);

  useRecommendationData({
    retryAttempt,
    policy: props.policy,
    recommendationCatalog,
    recommendationIndex,
    recommendationSource,
    recommendationSummary,
    setRecommendationCatalogs,
    setRecommendationIndex,
    setRecommendationPlatform,
    setRecommendationsError,
    setRecommendationCatalogLoading,
    setRecommendationIndexLoading,
  });

  return {
    retryRecommendations: () => setRetryAttempt((attempt) => attempt + 1),
    recommendationIndex,
    recommendationCatalogs,
    recommendationCatalog,
    recommendationSummary,
    recommendationSource,
    recommendationQuery,
    recommendationPlatform,
    selectedRecommendationId,
    recommendationsLoading: recommendationIndexLoading || recommendationCatalogLoading,
    recommendationsError,
    setRecommendationCatalogs,
    setRecommendationIndex,
    setRecommendationSourceState,
    setRecommendationQuery,
    setRecommendationPlatform,
    setSelectedRecommendationId,
    setRecommendationsError,
    setRecommendationIndexLoading,
    setRecommendationCatalogLoading,
  };
}

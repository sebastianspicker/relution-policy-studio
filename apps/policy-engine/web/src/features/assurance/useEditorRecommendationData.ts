/** Loads recommendation index/catalog data and synchronizes the active platform. */
import { useEffect, type Dispatch, type SetStateAction } from "react";
import type {
  RecommendationBrowseResponse,
  RecommendationIndexResponse,
  RecommendationSource,
  RecommendationSourceSummary,
} from "../../../../src/browser/assurance.js";
import type { WorkspacePolicy } from "../../../../src/browser/workspace.js";
import { requestRecommendationData } from "../../shared/editor-recommendation-request.js";
import { ALL_RECOMMENDATION_PLATFORMS, policyPlatform, preferredRecommendationPlatform } from "../../shared/recommendation-platform.js";

interface RecommendationDataProps {
  readonly retryAttempt: number;
  readonly policy: WorkspacePolicy | undefined;
  readonly recommendationCatalog: RecommendationBrowseResponse | undefined;
  readonly recommendationIndex: RecommendationIndexResponse | undefined;
  readonly recommendationSource: RecommendationSource;
  readonly recommendationSummary: RecommendationSourceSummary | undefined;
  readonly setRecommendationCatalogs: Dispatch<SetStateAction<Partial<Record<RecommendationSource, RecommendationBrowseResponse>>>>;
  readonly setRecommendationIndex: Dispatch<SetStateAction<RecommendationIndexResponse | undefined>>;
  readonly setRecommendationPlatform: Dispatch<SetStateAction<string>>;
  readonly setRecommendationsError: Dispatch<SetStateAction<string | undefined>>;
  readonly setRecommendationCatalogLoading: Dispatch<SetStateAction<boolean>>;
  readonly setRecommendationIndexLoading: Dispatch<SetStateAction<boolean>>;
}

export function useRecommendationData(props: RecommendationDataProps): void {
  useRecommendationIndex(props);
  useRecommendationCatalog(props);
  useRecommendationPlatform(props);
}

function useRecommendationIndex(props: RecommendationDataProps): void {
  useEffect(() => {
    if (props.recommendationIndex !== undefined) {
      props.setRecommendationIndexLoading(false);
      return;
    }
    return requestRecommendationData<RecommendationIndexResponse>(
      "/api/recommendations",
      props.setRecommendationIndexLoading,
      props.setRecommendationsError,
      props.setRecommendationIndex,
    );
  }, [props.retryAttempt, props.recommendationIndex, props.setRecommendationIndex, props.setRecommendationIndexLoading, props.setRecommendationsError]);
}

function useRecommendationCatalog(props: RecommendationDataProps): void {
  useEffect(() => {
    if (props.recommendationCatalog !== undefined) {
      props.setRecommendationCatalogLoading(false);
      return;
    }
    return requestRecommendationData<RecommendationBrowseResponse>(
      `/api/recommendations/${props.recommendationSource}/browse`,
      props.setRecommendationCatalogLoading,
      props.setRecommendationsError,
      (result) => props.setRecommendationCatalogs((current) => ({ ...current, [props.recommendationSource]: result })),
    );
  }, [
    props.retryAttempt,
    props.recommendationCatalog,
    props.recommendationSource,
    props.setRecommendationCatalogs,
    props.setRecommendationsError,
    props.setRecommendationCatalogLoading,
  ]);
}

function useRecommendationPlatform(props: RecommendationDataProps): void {
  useEffect(() => {
    if (props.recommendationSummary === undefined) return;
    const summary = props.recommendationSummary;
    props.setRecommendationPlatform((current) => {
      if (current !== ALL_RECOMMENDATION_PLATFORMS && summary.displayPlatforms.includes(current)) return current;
      return preferredRecommendationPlatform(summary, policyPlatform(props.policy)) ?? ALL_RECOMMENDATION_PLATFORMS;
    });
  }, [props.policy, props.recommendationSummary, props.setRecommendationPlatform]);
}

/** Shared controller contract for recommendation catalog state. */
import type { Dispatch, SetStateAction } from "react";
import type {
  RecommendationBrowseResponse,
  RecommendationIndexResponse,
  RecommendationSource,
  RecommendationSourceSummary,
} from "../../../../src/browser/assurance.js";
import { RECOMMENDATION_SOURCES } from "../../../../src/browser/assurance.js";

export interface EditorRecommendationState {
  readonly recommendationIndex: RecommendationIndexResponse | undefined;
  readonly recommendationCatalogs: Partial<Record<RecommendationSource, RecommendationBrowseResponse>>;
  readonly recommendationCatalog: RecommendationBrowseResponse | undefined;
  readonly recommendationSummary: RecommendationSourceSummary | undefined;
  readonly recommendationSource: RecommendationSource;
  readonly recommendationQuery: string;
  readonly recommendationPlatform: string;
  readonly selectedRecommendationId: string | undefined;
  readonly retryRecommendations: () => void;
  readonly recommendationsLoading: boolean;
  readonly recommendationsError: string | undefined;
  readonly setRecommendationCatalogs: Dispatch<SetStateAction<Partial<Record<RecommendationSource, RecommendationBrowseResponse>>>>;
  readonly setRecommendationIndex: Dispatch<SetStateAction<RecommendationIndexResponse | undefined>>;
  readonly setRecommendationSourceState: Dispatch<SetStateAction<RecommendationSource>>;
  readonly setRecommendationQuery: Dispatch<SetStateAction<string>>;
  readonly setRecommendationPlatform: Dispatch<SetStateAction<string>>;
  readonly setSelectedRecommendationId: Dispatch<SetStateAction<string | undefined>>;
  readonly setRecommendationsError: Dispatch<SetStateAction<string | undefined>>;
  readonly setRecommendationIndexLoading: Dispatch<SetStateAction<boolean>>;
  readonly setRecommendationCatalogLoading: Dispatch<SetStateAction<boolean>>;
}

export const DEFAULT_COMPLIANCE_SOURCES = [...RECOMMENDATION_SOURCES] satisfies RecommendationSource[];

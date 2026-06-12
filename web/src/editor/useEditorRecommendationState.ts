import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  RecommendationCatalogResponse,
  RecommendationIndexResponse,
  RecommendationSource,
  RecommendationSourceSummary,
} from "../../../src/recommendation-types.js";
import { RECOMMENDATION_SOURCES } from "../../../src/recommendation-types.js";
import type { WorkspacePolicy } from "../../../src/workspace.js";
import { networkEditorAuthHeaders, readJsonResponse } from "./editor-utils.js";
import { ALL_RECOMMENDATION_PLATFORMS, policyPlatform, preferredRecommendationPlatform } from "./recommendation-platform.js";

export interface EditorRecommendationState {
  readonly recommendationIndex: RecommendationIndexResponse | undefined;
  readonly recommendationCatalogs: Partial<Record<RecommendationSource, RecommendationCatalogResponse>>;
  readonly recommendationCatalog: RecommendationCatalogResponse | undefined;
  readonly recommendationSummary: RecommendationSourceSummary | undefined;
  readonly recommendationSource: RecommendationSource;
  readonly recommendationQuery: string;
  readonly recommendationPlatform: string;
  readonly selectedRecommendationId: string | undefined;
  readonly recommendationsLoading: boolean;
  readonly recommendationsError: string | undefined;
  readonly setRecommendationCatalogs: Dispatch<SetStateAction<Partial<Record<RecommendationSource, RecommendationCatalogResponse>>>>;
  readonly setRecommendationIndex: Dispatch<SetStateAction<RecommendationIndexResponse | undefined>>;
  readonly setRecommendationSourceState: Dispatch<SetStateAction<RecommendationSource>>;
  readonly setRecommendationQuery: Dispatch<SetStateAction<string>>;
  readonly setRecommendationPlatform: Dispatch<SetStateAction<string>>;
  readonly setSelectedRecommendationId: Dispatch<SetStateAction<string | undefined>>;
  readonly setRecommendationsError: Dispatch<SetStateAction<string | undefined>>;
  readonly setRecommendationIndexLoading: Dispatch<SetStateAction<boolean>>;
  readonly setRecommendationCatalogLoading: Dispatch<SetStateAction<boolean>>;
}

export function useRecommendationState(props: {
  readonly policy: WorkspacePolicy | undefined;
}): EditorRecommendationState {
  const [recommendationIndex, setRecommendationIndex] = useState<RecommendationIndexResponse | undefined>();
  const [recommendationCatalogs, setRecommendationCatalogs] = useState<Partial<Record<RecommendationSource, RecommendationCatalogResponse>>>({});
  const [recommendationSource, setRecommendationSourceState] = useState<RecommendationSource>("bsi");
  const [recommendationQuery, setRecommendationQuery] = useState("");
  const [recommendationPlatform, setRecommendationPlatform] = useState(ALL_RECOMMENDATION_PLATFORMS);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | undefined>();
  const [recommendationIndexLoading, setRecommendationIndexLoading] = useState(false);
  const [recommendationCatalogLoading, setRecommendationCatalogLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | undefined>();
  const recommendationCatalog = recommendationCatalogs[recommendationSource];
  const recommendationSummary = recommendationIndex?.sources.find((candidate) => candidate.source === recommendationSource);
  const recommendationsLoading = recommendationIndexLoading || recommendationCatalogLoading;

  useRecommendationData({
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
    recommendationIndex,
    recommendationCatalogs,
    recommendationCatalog,
    recommendationSummary,
    recommendationSource,
    recommendationQuery,
    recommendationPlatform,
    selectedRecommendationId,
    recommendationsLoading,
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

function useRecommendationData(props: {
  readonly policy: WorkspacePolicy | undefined;
  readonly recommendationCatalog: RecommendationCatalogResponse | undefined;
  readonly recommendationIndex: RecommendationIndexResponse | undefined;
  readonly recommendationSource: RecommendationSource;
  readonly recommendationSummary: RecommendationSourceSummary | undefined;
  readonly setRecommendationCatalogs: Dispatch<SetStateAction<Partial<Record<RecommendationSource, RecommendationCatalogResponse>>>>;
  readonly setRecommendationIndex: Dispatch<SetStateAction<RecommendationIndexResponse | undefined>>;
  readonly setRecommendationPlatform: Dispatch<SetStateAction<string>>;
  readonly setRecommendationsError: Dispatch<SetStateAction<string | undefined>>;
  readonly setRecommendationCatalogLoading: Dispatch<SetStateAction<boolean>>;
  readonly setRecommendationIndexLoading: Dispatch<SetStateAction<boolean>>;
}): void {
  useEffect(() => {
    if (props.recommendationIndex !== undefined) {
      props.setRecommendationIndexLoading(false);
      return;
    }
    let cancelled = false;
    props.setRecommendationIndexLoading(true);
    props.setRecommendationsError(undefined);
    void fetch("/api/recommendations", { headers: networkEditorAuthHeaders() })
      .then(async (response) => {
        const result = await readJsonResponse<RecommendationIndexResponse>(response);
        if (!response.ok) {
          throw new Error(JSON.stringify(result));
        }
        if (!cancelled) {
          props.setRecommendationIndex(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          props.setRecommendationsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          props.setRecommendationIndexLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.recommendationIndex, props.setRecommendationIndex, props.setRecommendationIndexLoading, props.setRecommendationsError]);

  useEffect(() => {
    if (props.recommendationCatalog !== undefined) {
      props.setRecommendationCatalogLoading(false);
      return;
    }
    let cancelled = false;
    props.setRecommendationCatalogLoading(true);
    props.setRecommendationsError(undefined);
    void fetch(`/api/recommendations/${props.recommendationSource}`, { headers: networkEditorAuthHeaders() })
      .then(async (response) => {
        const result = await readJsonResponse<RecommendationCatalogResponse>(response);
        if (!response.ok) {
          throw new Error(JSON.stringify(result));
        }
        if (!cancelled) {
          props.setRecommendationCatalogs((current) => ({ ...current, [props.recommendationSource]: result }));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          props.setRecommendationsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          props.setRecommendationCatalogLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.recommendationCatalog,
    props.recommendationSource,
    props.setRecommendationCatalogs,
    props.setRecommendationsError,
    props.setRecommendationCatalogLoading,
  ]);

  useEffect(() => {
    if (props.recommendationSummary === undefined) {
      return;
    }
    const summary = props.recommendationSummary;
    props.setRecommendationPlatform((current) => {
      if (current !== ALL_RECOMMENDATION_PLATFORMS && summary.displayPlatforms.includes(current)) {
        return current;
      }
      const preferred = preferredRecommendationPlatform(summary, policyPlatform(props.policy));
      return preferred ?? ALL_RECOMMENDATION_PLATFORMS;
    });
  }, [props.policy, props.recommendationSummary, props.setRecommendationPlatform]);
}

export const DEFAULT_COMPLIANCE_SOURCES = [...RECOMMENDATION_SOURCES] satisfies RecommendationSource[];

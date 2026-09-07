/** Filters recommendation catalogs and exposes actionable ruleset import controls. */
import { useEffect, useState, type JSX } from "react";
import type { EditorController } from "../../shared/editor-contracts.js";
import { RecommendationSourceTabs, recommendationPanelId, recommendationTabId } from "./RecommendationSourceTabs.js";
import { RecommendationsPanelContent } from "./RecommendationsPanelContent.js";
import {
  ALL_ACHIEVABILITY,
  ALL_SURFACES,
  RECOMMENDATION_SCOPE_ACTIONABLE,
} from "./recommendation-constants.js";
import { recommendationViewState, type RecommendationScope } from "./recommendation-view.js";

export function RecommendationsPanel({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  const [achievabilityFilter, setAchievabilityFilter] = useState(ALL_ACHIEVABILITY);
  const [surfaceFilter, setSurfaceFilter] = useState(ALL_SURFACES);
  const [recommendationScope, setRecommendationScope] = useState<RecommendationScope>(RECOMMENDATION_SCOPE_ACTIONABLE);
  const catalog = c.recommendationCatalog;
  useEffect(() => resetFilters(setAchievabilityFilter, setSurfaceFilter, setRecommendationScope), [c.recommendationSource]);
  const view = recommendationViewState(c, recommendationScope, achievabilityFilter, surfaceFilter);
  useEffect(() => clearInvalidSelection(c, view.selectedRecommendation), [c, view.selectedRecommendation]);
  return (
    <div className="inspector-content recommendations-panel">
      <h2>Recommendations</h2>
      <RecommendationSourceTabs controller={c} sources={view.sources} />
      <section id={recommendationPanelId(c.recommendationSource)} role="tabpanel" aria-labelledby={recommendationTabId(c.recommendationSource)}>
        <RecommendationsPanelContent controller={c} catalogAvailable={catalog?.available} view={view} achievabilityFilter={achievabilityFilter} surfaceFilter={surfaceFilter} setAchievabilityFilter={setAchievabilityFilter} setSurfaceFilter={setSurfaceFilter} setRecommendationScope={setRecommendationScope} />
      </section>
    </div>
  );
}

function resetFilters(
  setAchievabilityFilter: (value: string) => void,
  setSurfaceFilter: (value: string) => void,
  setRecommendationScope: (value: RecommendationScope) => void,
): void {
  setAchievabilityFilter(ALL_ACHIEVABILITY);
  setSurfaceFilter(ALL_SURFACES);
  setRecommendationScope(RECOMMENDATION_SCOPE_ACTIONABLE);
}

function clearInvalidSelection(controller: EditorController, selectedRecommendation: unknown): void {
  if (controller.selectedRecommendationId !== undefined && selectedRecommendation === undefined) controller.setSelectedRecommendationId(undefined);
}

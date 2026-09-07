import type { JSX } from "react";
import { RecommendationEvidence } from "./RecommendationEvidence.js";
import { CoverageDisclosure } from "./RecommendationDetail.js";
import { RecommendationList } from "./RecommendationList.js";
import {
  ALL_ACHIEVABILITY,
  ALL_RECOMMENDATION_PLATFORMS,
  ALL_SURFACES,
  RECOMMENDATION_SCOPE_ACTIONABLE,
  RECOMMENDATION_SCOPE_ALL,
  RECOMMENDATION_SCOPE_WITHOUT_SETTINGS,
} from "./recommendation-constants.js";
import { categoryLabel, surfaceLabel } from "./recommendation-implementation.js";
import { canImportRuleset, scopeLabel } from "./recommendation-view-metadata.js";
import { type RecommendationScope, type RecommendationViewState } from "./recommendation-view.js";
import type { EditorController } from "../../shared/editor-contracts.js";

export function RecommendationsPanelContent(props: {
  readonly controller: EditorController;
  readonly catalogAvailable: boolean | undefined;
  readonly view: RecommendationViewState;
  readonly achievabilityFilter: string;
  readonly surfaceFilter: string;
  readonly setAchievabilityFilter: (value: string) => void;
  readonly setSurfaceFilter: (value: string) => void;
  readonly setRecommendationScope: (value: RecommendationScope) => void;
}): JSX.Element {
  const { controller: c, view } = props;
  return <>
    <RecommendationSummary view={view} platform={c.recommendationPlatform} />
    {c.recommendationsError !== undefined ? <div><p className="error" role="alert">{c.recommendationsError}</p><button type="button" onClick={c.retryRecommendations}>Retry recommendations</button></div> : null}
    {(view.summary === undefined && c.recommendationsError === undefined) || c.recommendationsLoading ? <p className="loading-inline" aria-live="polite">Loading recommendation catalog…</p> : null}
    {view.summary !== undefined && !c.recommendationsLoading ? <RecommendationCatalogContent {...props} /> : null}
  </>;
}

function RecommendationSummary({ view, platform }: { readonly view: RecommendationViewState; readonly platform: string }): JSX.Element | null {
  if (view.summary === undefined) return null;
  return <>
    <p className="status recommendation-summary">{view.summary.label} | {view.summary.recommendationCount} recommendations | verified {view.summary.verifiedAsOf ?? "unknown"}</p>
    <p className="status recommendation-summary">Exact {view.sourceCoverage.exactMappings} | Actionable {view.sourceCoverage.actionableRecommendations} | Partial {view.sourceCoverage.partialRecommendations} | Helper {view.sourceCoverage.helperOnlyRecommendations} | Gap {view.sourceCoverage.gapRecommendations}</p>
    <p className="status recommendation-summary">Showing {scopeLabel(view.effectiveRecommendationScope)}: {view.filteredRecommendations.length} of {view.scopedRecommendations.length} scoped recommendations</p>
    <CoverageDisclosure coverage={view.filteredCoverage} total={view.filteredRecommendations.length} platform={platform} />
  </>;
}

function RecommendationCatalogContent(props: Parameters<typeof RecommendationsPanelContent>[0]): JSX.Element {
  const { controller: c, view } = props;
  return <>
    <RecommendationControls {...props} />
    {props.catalogAvailable === undefined ? null : !props.catalogAvailable ? <p className="warning">{c.recommendationCatalog?.error ?? `${c.recommendationCatalog?.label} recommendations are unavailable.`}</p> : view.selectedRecommendation === undefined ? (
      <RecommendationList recommendations={view.filteredRecommendations} source={c.recommendationSource} onSelect={c.setSelectedRecommendationId} />
    ) : <RecommendationEvidence key={`${c.recommendationSource}:${view.selectedRecommendation.id}`} summary={view.summary!} source={c.recommendationSource} id={view.selectedRecommendation.id} onBack={() => c.setSelectedRecommendationId(undefined)} />}
  </>;
}

function RecommendationControls(props: Parameters<typeof RecommendationsPanelContent>[0]): JSX.Element {
  const { controller: c, view } = props;
  return <div className="recommendation-controls">
    <label>Scope<select value={view.effectiveRecommendationScope} onChange={(event) => props.setRecommendationScope(event.target.value as RecommendationScope)}><option value={RECOMMENDATION_SCOPE_ACTIONABLE}>Actionable settings</option><option value={RECOMMENDATION_SCOPE_WITHOUT_SETTINGS}>Recommendations without settings</option><option value={RECOMMENDATION_SCOPE_ALL}>All recommendations</option></select></label>
    <label>Search<input name="recommendation-search" type="search" autoComplete="off" value={c.recommendationQuery} onChange={(event) => c.setRecommendationQuery(event.target.value)} /></label>
    <label>Platform<select value={c.recommendationPlatform} onChange={(event) => c.setRecommendationPlatform(event.target.value)}><option value={ALL_RECOMMENDATION_PLATFORMS}>All</option>{view.summary!.displayPlatforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select></label>
    <label>Achievability<select value={props.achievabilityFilter} onChange={(event) => props.setAchievabilityFilter(event.target.value)}><option value={ALL_ACHIEVABILITY}>All</option>{view.availableCategories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select></label>
    <label>Surface<select value={props.surfaceFilter} onChange={(event) => props.setSurfaceFilter(event.target.value)}><option value={ALL_SURFACES}>All</option>{view.availableSurfaces.map((surface) => <option key={surface} value={surface}>{surfaceLabel(surface)}</option>)}</select></label>
    <button type="button" disabled={!canImportRuleset(c.recommendationCatalog, c.recommendationPlatform)} onClick={() => void c.importRecommendationRuleset()}>Import actionable settings</button>
  </div>;
}

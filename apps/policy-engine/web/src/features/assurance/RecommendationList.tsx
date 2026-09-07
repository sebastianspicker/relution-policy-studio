import type { JSX } from "react";
import type { RecommendationBrowseRow, RecommendationSource } from "../../../../src/browser/assurance.js";
import { secondaryRecommendationId } from "./recommendation-record-utils.js";
import { categoryLabel, implementationOf, importabilityLabel, surfaceLabel } from "./recommendation-implementation.js";

export function RecommendationList(props: {
  readonly recommendations: readonly RecommendationBrowseRow[];
  readonly source: RecommendationSource;
  readonly onSelect: (recommendationId: string) => void;
}): JSX.Element {
  if (props.recommendations.length === 0) return <p className="empty-state">No recommendations match the current filters.</p>;
  return <div className="recommendation-list">{props.recommendations.map((recommendation) => (
    <RecommendationCard key={recommendation.id} recommendation={recommendation} source={props.source} onSelect={props.onSelect} />
  ))}</div>;
}

function RecommendationCard(props: {
  readonly recommendation: RecommendationBrowseRow;
  readonly source: RecommendationSource;
  readonly onSelect: (recommendationId: string) => void;
}): JSX.Element {
  const implementation = implementationOf(props.recommendation);
  return <button type="button" className="recommendation-card" onClick={() => props.onSelect(props.recommendation.id)}>
    <strong>{props.recommendation.title}</strong>
    <span>{secondaryRecommendationId(props.source, props.recommendation)}</span>
    <span>{props.recommendation.platform}</span>
    <span>Achievability: {categoryLabel(implementation.category)}</span>
    <span>Surfaces: {implementation.surfaces.map(surfaceLabel).join(", ") || "None"}</span>
    <span>Mapping: {props.recommendation.relutionMapping.status}</span>
    <span>{importabilityLabel(implementation)}</span>
  </button>;
}

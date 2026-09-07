import { useRef, type JSX, type KeyboardEvent } from "react";
import type { RecommendationSource, RecommendationSourceSummary } from "../../../../src/browser/assurance.js";
import type { EditorController } from "../../shared/editor-contracts.js";

export function RecommendationSourceTabs(props: {
  readonly controller: EditorController;
  readonly sources: readonly RecommendationSourceSummary[];
}): JSX.Element {
  const tablistRef = useRef<HTMLDivElement>(null);
  const selectSource = (source: RecommendationSource): void => {
    props.controller.setRecommendationSource(source);
    tablistRef.current?.querySelector<HTMLElement>(`#${recommendationTabId(source)}`)?.focus();
  };
  return (
    <div ref={tablistRef} className="recommendation-source-switcher" role="tablist" aria-label="Recommendation sources">
      {props.sources.map((source) => (
        <button
          key={source.source}
          type="button"
          id={recommendationTabId(source.source)}
          role="tab"
          tabIndex={source.source === props.controller.recommendationSource ? 0 : -1}
          aria-selected={source.source === props.controller.recommendationSource}
          aria-controls={recommendationPanelId(source.source)}
          className={source.source === props.controller.recommendationSource ? "active" : ""}
          onClick={() => props.controller.setRecommendationSource(source.source)}
          onKeyDown={(event) => handleSourceKeyDown(event, source.source, props.sources, selectSource)}
        >
          {source.label}
        </button>
      ))}
    </div>
  );
}

function handleSourceKeyDown(
  event: KeyboardEvent,
  currentSource: RecommendationSource,
  sources: readonly RecommendationSourceSummary[],
  selectSource: (source: RecommendationSource) => void,
): void {
  const nextSource = nextSourceId(event.key, currentSource, sources);
  if (nextSource === undefined) return;
  event.preventDefault();
  selectSource(nextSource);
}

function nextSourceId(key: string, currentSource: RecommendationSource, sources: readonly RecommendationSourceSummary[]): RecommendationSource | undefined {
  const ids = sources.map((source) => source.source);
  const currentIndex = ids.indexOf(currentSource);
  if (key === "ArrowRight") return ids[(currentIndex + 1) % ids.length];
  if (key === "ArrowLeft") return ids[(currentIndex - 1 + ids.length) % ids.length];
  if (key === "Home") return ids[0];
  return key === "End" ? ids[ids.length - 1] : undefined;
}

export function recommendationTabId(source: RecommendationSource): string {
  return `recommendation-tab-${source}`;
}

export function recommendationPanelId(source: RecommendationSource): string {
  return `recommendation-panel-${source}`;
}

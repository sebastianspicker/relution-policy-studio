/** Loads full evidence only for the selected recommendation; errors remain retryable. */
import { useEffect, useState, type JSX } from "react";
import type { RecommendationRecord, RecommendationSource, RecommendationSourceSummary } from "../../../../src/browser/assurance.js";
import { loadRecommendationData } from "../../shared/editor-recommendation-request.js";
import { RecommendationDetail } from "./RecommendationDetail.js";

export function RecommendationEvidence(props: { readonly source: RecommendationSource; readonly id: string; readonly summary: RecommendationSourceSummary; readonly onBack: () => void }): JSX.Element {
  const [record, setRecord] = useState<RecommendationRecord>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setRecord(undefined);
    setError(undefined);
    void loadRecommendationData<RecommendationRecord>(`/api/recommendations/${props.source}/records/${encodeURIComponent(props.id)}`).then((value) => { if (active) setRecord(value); }, (reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [props.source, props.id, attempt]);
  if (record !== undefined) return <RecommendationDetail source={props.source} summary={props.summary} recommendation={record} onBack={props.onBack} />;
  return <div><button type="button" onClick={props.onBack}>Back to recommendations</button>{error === undefined ? <p role="status">Loading recommendation evidence…</p> : <><p role="alert">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry evidence</button></>}</div>;
}

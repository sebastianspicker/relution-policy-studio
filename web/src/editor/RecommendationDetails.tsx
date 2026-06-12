import type { JSX } from "react";
import type { CisRecommendationRecord, RecommendationRecord, VendorRecommendationRecord } from "../../../src/recommendation-types.js";

export function CisRecommendationSummaryDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const item = recommendation as CisRecommendationRecord;
  return (
    <>
      <p>{item.benchmarkTitle} | v{item.benchmarkVersion} | {item.recommendationId}</p>
      <p>{String(item.recommendedValue)} | default {String(item.defaultValue)}</p>
      {item.profileApplicability.length > 0 ? <p>{item.profileApplicability.join(", ")}</p> : null}
      <details className="preview-block" open>
        <summary>Description</summary>
        <p>{item.description}</p>
      </details>
      <details className="preview-block">
        <summary>Rationale</summary>
        <p>{item.rationale}</p>
      </details>
    </>
  );
}

export function VendorRecommendationDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const item = recommendation as VendorRecommendationRecord;
  return (
    <>
      <p>{item.section} | recommended {String(item.recommendedValue)}</p>
      <details className="preview-block" open>
        <summary>Reason</summary>
        <p>{item.reason}</p>
      </details>
      {item.sourceIds.length > 0 ? <p>Sources: {item.sourceIds.join(", ")}</p> : null}
    </>
  );
}

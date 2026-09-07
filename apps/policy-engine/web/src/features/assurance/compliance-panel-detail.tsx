/** Shows source-specific recommendation evidence and the selected result's compliance evaluation. */
import type { JSX } from "react";
import type { ComplianceRecommendationResult } from "../../../../src/browser/assurance.js";
import { FallbackTranslationsSection } from "./FallbackTranslationsSection.js";
import { CisRecommendationSummaryDetail, VendorRecommendationDetail } from "./RecommendationDetails.js";
import { BsiDetail } from "./RecommendationsBsiDetail.js";
import { ComplianceEvaluation } from "./compliance-panel-evaluation.js";
import { COMPLIANCE_SOURCE_LABELS } from "./compliance-panel-model.js";
import { secondaryRecommendationId } from "./recommendation-record-utils.js";

export function ComplianceDetail(props: {
  readonly result: ComplianceRecommendationResult;
  readonly onBack: () => void;
  readonly onApply: (remediationId: string) => void;
}): JSX.Element {
  const { result } = props;
  return (
    <div className="recommendation-detail">
      <div className="json-actions"><button type="button" onClick={props.onBack}>Back</button></div>
      <h3>{result.recommendation.title}</h3>
      <p className="status">{COMPLIANCE_SOURCE_LABELS[result.source]} | {secondaryRecommendationId(result.source, result.recommendation)} | {result.recommendation.platform}</p>
      <ComplianceSourceDetail result={result} />
      <FallbackTranslationsSection recommendation={result.recommendation} />
      <ComplianceEvaluation result={result} onApply={props.onApply} />
    </div>
  );
}

function ComplianceSourceDetail({ result }: { readonly result: ComplianceRecommendationResult }): JSX.Element {
  if (result.source === "bsi") return <BsiDetail recommendation={result.recommendation} />;
  if (result.source === "cis") return <CisRecommendationSummaryDetail recommendation={result.recommendation} />;
  return <VendorRecommendationDetail recommendation={result.recommendation} />;
}

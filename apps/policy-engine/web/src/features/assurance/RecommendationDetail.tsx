import type { JSX } from "react";
import type { CisRecommendationRecord, RecommendationRecord, RecommendationSource, RecommendationSourceSummary } from "../../../../src/browser/assurance.js";
import { FallbackTranslationsSection } from "./FallbackTranslationsSection.js";
import { CisRecommendationSummaryDetail, VendorRecommendationDetail } from "./RecommendationDetails.js";
import { BsiDetail } from "./RecommendationsBsiDetail.js";
import { secondaryRecommendationId } from "./recommendation-record-utils.js";
import { categoryLabel, implementationOf, importabilityLabel, surfaceLabel } from "./recommendation-implementation.js";
import type { CoverageSummary } from "./recommendation-view.js";
import { ALL_RECOMMENDATION_PLATFORMS } from "./recommendation-constants.js";

export function RecommendationDetail(props: {
  readonly summary: RecommendationSourceSummary;
  readonly source: RecommendationSource;
  readonly recommendation: RecommendationRecord;
  readonly onBack: () => void;
}): JSX.Element {
  const implementation = implementationOf(props.recommendation);
  return (
    <div className="recommendation-detail">
      <div className="json-actions"><button type="button" onClick={props.onBack}>Back</button></div>
      <h3>{props.recommendation.title}</h3>
      <p className="status">{props.summary.label} | {secondaryRecommendationId(props.source, props.recommendation)} | {props.recommendation.platform}</p>
      <SourceRecommendationDetail source={props.source} recommendation={props.recommendation} />
      <FallbackTranslationsSection recommendation={props.recommendation} secondaryOnly={implementation.category === "relution-achievable"} open={implementation.category !== "relution-achievable"} />
      <RelutionMappingDetail recommendation={props.recommendation} />
    </div>
  );
}

function SourceRecommendationDetail({ source, recommendation }: { readonly source: RecommendationSource; readonly recommendation: RecommendationRecord }): JSX.Element | null {
  if (source === "bsi") return <BsiDetail recommendation={recommendation} />;
  if (source === "cis") return <CisDetail recommendation={recommendation} />;
  return source === "vendor" ? <VendorRecommendationDetail recommendation={recommendation} /> : null;
}

function RelutionMappingDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const implementation = implementationOf(recommendation);
  return <section className="preview-block">
    <h4>Relution mapping</h4>
    <p>Achievability: {categoryLabel(implementation.category)}</p>
    <p>Surfaces: {implementation.surfaces.map(surfaceLabel).join(", ") || "None"}</p>
    <p>Importable via: {implementation.importableVia.join(", ") || "Not importable"}</p>
    <p>Status: {recommendation.relutionMapping.status}</p>
    <p>Generated importability: {importabilityLabel(implementation)}</p>
    <MappingEvidence recommendation={recommendation} blockingReasons={implementation.blockingReasons} />
  </section>;
}

function MappingEvidence({ recommendation, blockingReasons }: { readonly recommendation: RecommendationRecord; readonly blockingReasons: readonly string[] }): JSX.Element {
  return <>
    {blockingReasons.length > 0 ? <pre>{blockingReasons.join("\n")}</pre> : null}
    {recommendation.relutionMapping.candidates.length > 0 ? <pre>{recommendation.relutionMapping.candidates.map(formatMappingCandidate).join("\n\n")}</pre> : null}
    {recommendation.relutionMapping.rulesetMappings.length > 0 ? <pre>{JSON.stringify(recommendation.relutionMapping.rulesetMappings, null, 2)}</pre> : null}
  </>;
}

function formatMappingCandidate(candidate: RecommendationRecord["relutionMapping"]["candidates"][number]): string {
  const lines = [`${candidate.kind}: ${candidate.target} (${candidate.fieldPaths.join(", ")})`];
  if (candidate.semanticConceptId !== undefined && candidate.semanticConceptId.length > 0) lines.push(`concept: ${candidate.semanticConceptId}`);
  if (candidate.match !== undefined) {
    lines.push(`match: ${candidate.match.valueCompatibility} | score ${candidate.match.score}`);
    if (candidate.match.matchedTerms.length > 0) lines.push(`terms: ${candidate.match.matchedTerms.join(", ")}`);
    lines.push(`reason: ${candidate.match.reason}`);
  }
  return lines.join("\n");
}

function CisDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const item = recommendation as CisRecommendationRecord;
  return <>
    <CisRecommendationSummaryDetail recommendation={recommendation} />
    {item.impact.length > 0 ? <details className="preview-block"><summary>Impact</summary><p>{item.impact}</p></details> : null}
    <details className="preview-block"><summary>Audit</summary><pre>{item.audit}</pre></details>
    <details className="preview-block"><summary>Remediation</summary><pre>{item.remediation}</pre></details>
  </>;
}

export function CoverageDisclosure({ coverage, total, platform }: { readonly coverage: CoverageSummary; readonly total: number; readonly platform: string }): JSX.Element | null {
  const informational = coverage.partialRecommendations + coverage.helperOnlyRecommendations + coverage.gapRecommendations;
  if (total === 0 || informational === 0) return null;
  const scope = platform === ALL_RECOMMENDATION_PLATFORMS ? "this source" : platform;
  return <p className="warning recommendation-summary">
    Coverage note for {scope}: {coverage.actionableRecommendations} of {total} recommendations are actionable exact Relution mappings. The remaining {informational} entries stay informational, partial, or helper-only.
  </p>;
}

import { useEffect, useState, type JSX } from "react";
import type {
  BsiRecommendationRecord,
  CisRecommendationRecord,
  RecommendationFallbackTranslation,
  RecommendationRecord,
  RecommendationSource,
  VendorRecommendationRecord,
} from "../../../src/recommendation-types.js";
import type { ComplianceRecommendationResult, ComplianceStatus } from "../../../src/compliance.js";
import { fallbackTranslationsOf, secondaryRecommendationId } from "./recommendation-record-utils.js";
import type { EditorController } from "./types.js";

const ALL_STATUSES = "ALL";
const SOURCE_LABELS: Record<RecommendationSource, string> = {
  bsi: "BSI",
  vendor: "Vendor",
  cis: "CIS",
};

export function CompliancePanel({ controller: c }: { readonly controller: EditorController }): JSX.Element {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUSES);
  const [selectedResultId, setSelectedResultId] = useState<string | undefined>();

  const report = c.complianceReport;
  const filteredResults = report?.results.filter((result) => matchesComplianceFilters(result, c.complianceSources, query, statusFilter)) ?? [];
  const selectedResult = filteredResults.find((result) => result.id === selectedResultId);

  useEffect(() => {
    if (selectedResultId === undefined) {
      return;
    }
    if (!filteredResults.some((result) => result.id === selectedResultId)) {
      setSelectedResultId(undefined);
    }
  }, [filteredResults, selectedResultId]);

  return (
    <div className="inspector-content recommendations-panel">
      <h2>Compliance</h2>
      {c.policy === undefined ? (
        <p className="empty-state">Select a policy to compare it against the harvested recommendations.</p>
      ) : (
        <>
          <p className="status recommendation-summary">
            {c.policy.document.name as string} | {String(c.policy.document.platform)}
          </p>
          <div className="recommendation-source-switcher" role="group" aria-label="Compliance sources">
            {(["bsi", "vendor", "cis"] as const).map((source) => {
              const active = c.complianceSources.includes(source);
              const isLastActiveSource = active && c.complianceSources.length === 1;
              return (
                <button
                  key={source}
                  type="button"
                  aria-pressed={active}
                  className={active ? "active" : ""}
                  disabled={isLastActiveSource}
                  title={isLastActiveSource ? "At least one compliance source must remain active." : undefined}
                  onClick={() => c.toggleComplianceSource(source)}
                >
                  {SOURCE_LABELS[source]}
                </button>
              );
            })}
          </div>
          <div className="compliance-actions">
            <button type="button" onClick={() => void c.refreshCompliance()}>
              Refresh
            </button>
          </div>
          {report !== undefined ? (
            <div className="compliance-stat-row" role="status" aria-label="Compliance summary">
              <span className="compliance-stat compliance-stat--compliant">✓ {report.summary.byStatus.compliant}</span>
              <span className="compliance-stat compliance-stat--gap">Gap {report.summary.byStatus["exact-gap"]}</span>
              <span className="compliance-stat compliance-stat--choice">Choice {report.summary.byStatus["choice-required"]}</span>
              <span className="compliance-stat compliance-stat--param">Param {report.summary.byStatus["parameter-required"]}</span>
              <span className="compliance-stat compliance-stat--unknown">? {report.summary.byStatus["not-checkable"]}</span>
            </div>
          ) : null}
          {c.complianceError !== undefined ? <p className="error">{c.complianceError}</p> : null}
          {c.complianceLoading ? <p className="loading-inline" aria-live="polite">Checking compliance…</p> : null}
          {report === undefined && !c.complianceLoading ? <p className="empty-state">No compliance report has been generated yet.</p> : null}
          {report !== undefined && !c.complianceLoading ? (
            <>
              <div className="recommendation-controls">
                <label>
                  Search
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
                </label>
                <label>
                  Status
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value={ALL_STATUSES}>All</option>
                    <option value="compliant">Compliant</option>
                    <option value="exact-gap">Exact gap</option>
                    <option value="choice-required">Choice required</option>
                    <option value="parameter-required">Parameter required</option>
                    <option value="not-checkable">Not checkable</option>
                  </select>
                </label>
              </div>
              {selectedResult === undefined ? (
                <ComplianceList results={filteredResults} onSelect={setSelectedResultId} />
              ) : (
                <ComplianceDetail
                  result={selectedResult}
                  onBack={() => setSelectedResultId(undefined)}
                  onApply={(remediationId) => void c.applyComplianceRemediation(remediationId)}
                />
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function ComplianceList(props: {
  readonly results: ComplianceRecommendationResult[];
  readonly onSelect: (resultId: string) => void;
}): JSX.Element {
  if (props.results.length === 0) {
    return <p className="empty-state">No compliance results match the current filters.</p>;
  }
  return (
    <div className="recommendation-list">
      {props.results.map((result) => (
        <button
          key={result.id}
          type="button"
          className="recommendation-card"
          onClick={() => props.onSelect(result.id)}
        >
          <strong>{result.recommendation.title}</strong>
          <span>{SOURCE_LABELS[result.source]} | {secondaryRecommendationId(result.source, result.recommendation)}</span>
          <span>{result.recommendation.platform}</span>
          <span>Status: {statusLabel(result.status)}</span>
          <span>{result.remediationOptions.length > 0 ? `${result.remediationOptions.length} remediation option(s)` : "No direct remediation"}</span>
        </button>
      ))}
    </div>
  );
}

function ComplianceDetail(props: {
  readonly result: ComplianceRecommendationResult;
  readonly onBack: () => void;
  readonly onApply: (remediationId: string) => void;
}): JSX.Element {
  return (
    <div className="recommendation-detail">
      <div className="json-actions">
        <button type="button" onClick={props.onBack}>Back</button>
      </div>
      <h3>{props.result.recommendation.title}</h3>
      <p className="status">
        {SOURCE_LABELS[props.result.source]} | {secondaryRecommendationId(props.result.source, props.result.recommendation)} | {props.result.recommendation.platform}
      </p>
      {props.result.source === "bsi" ? <BsiDetail recommendation={props.result.recommendation} /> : null}
      {props.result.source === "cis" ? <CisDetail recommendation={props.result.recommendation} /> : null}
      {props.result.source === "vendor" ? <VendorDetail recommendation={props.result.recommendation} /> : null}
      <FallbackTranslationsSection recommendation={props.result.recommendation} />
      <section className="preview-block">
        <h4>Compliance</h4>
        <p>Status: {statusLabel(props.result.status)}</p>
        {props.result.matchedConfigurations.length > 0 ? (
          <pre>{props.result.matchedConfigurations.map((entry) => `${entry.label} (#${entry.configurationIndex + 1})`).join("\n")}</pre>
        ) : (
          <p>No matching configuration currently satisfies this recommendation.</p>
        )}
        {props.result.mappingResults.length > 0 ? (
          <pre>{props.result.mappingResults.map((entry) => `${entry.kind}: ${entry.target} -> ${entry.status}`).join("\n")}</pre>
        ) : null}
        {props.result.blockingReasons.length > 0 ? (
          <pre>{props.result.blockingReasons.join("\n")}</pre>
        ) : null}
        {props.result.remediationOptions.length > 0 ? (
          <div className="json-actions">
            {props.result.remediationOptions.map((option) => (
              <button key={option.id} type="button" onClick={() => props.onApply(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function BsiDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
  const item = recommendation as BsiRecommendationRecord;
  return (
    <>
      <p>{item.moduleId} | {item.moduleTitle}</p>
      <p>{item.category} | {item.status} | {item.protectionLevel}</p>
      <details className="preview-block" open>
        <summary>Requirement</summary>
        <p>{item.requirementText}</p>
      </details>
      <details className="preview-block">
        <summary>Reason</summary>
        <p>{item.reason}</p>
      </details>
    </>
  );
}

function CisDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
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

function VendorDetail({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element {
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

function FallbackTranslationsSection({ recommendation }: { readonly recommendation: RecommendationRecord }): JSX.Element | null {
  const fallbacks = fallbackTranslationsOf(recommendation);
  if (fallbacks.length === 0) {
    return null;
  }
  return (
    <details className="preview-block">
      <summary>Fallback methods</summary>
      {fallbacks.map((fallback) => <FallbackTranslationView key={fallback.id} fallback={fallback} />)}
    </details>
  );
}

function FallbackTranslationView({ fallback }: { readonly fallback: RecommendationFallbackTranslation }): JSX.Element {
  return (
    <section className="preview-block">
      <h5>{fallback.title}</h5>
      <p>{fallback.role} | {fallback.method}</p>
      {fallback.commands.length > 0 ? <pre>{fallback.commands.join("\n")}</pre> : null}
      {fallback.groupPolicyPaths !== undefined && fallback.groupPolicyPaths.length > 0 ? <pre>{fallback.groupPolicyPaths.join("\n")}</pre> : null}
      {fallback.registryPaths !== undefined && fallback.registryPaths.length > 0 ? <pre>{fallback.registryPaths.join("\n")}</pre> : null}
      {fallback.profilePayloadType !== undefined ? <p>PayloadType: {fallback.profilePayloadType}</p> : null}
      {fallback.profileKeys !== undefined && fallback.profileKeys.length > 0 ? (
        <pre>{fallback.profileKeys.map((entry) => `${entry.key}: ${entry.value}`).join("\n")}</pre>
      ) : null}
    </section>
  );
}

function matchesComplianceFilters(
  result: ComplianceRecommendationResult,
  activeSources: RecommendationSource[],
  query: string,
  status: string,
): boolean {
  if (!activeSources.includes(result.source)) {
    return false;
  }
  if (status !== ALL_STATUSES && result.status !== status) {
    return false;
  }
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return true;
  }
  return [
    result.recommendation.title,
    result.recommendation.platform,
    SOURCE_LABELS[result.source],
    secondaryRecommendationId(result.source, result.recommendation),
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function statusLabel(status: ComplianceStatus): string {
  if (status === "exact-gap") {
    return "Exact gap";
  }
  if (status === "choice-required") {
    return "Choice required";
  }
  if (status === "not-checkable") {
    return "Not checkable";
  }
  if (status === "parameter-required") {
    return "Parameter required";
  }
  return "Compliant";
}

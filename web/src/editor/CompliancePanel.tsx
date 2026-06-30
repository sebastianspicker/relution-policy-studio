import { useEffect, useState, type JSX } from "react";
import type { RecommendationSource } from "../../../src/recommendation-types.js";
import type { ComplianceRecommendationResult, ComplianceStatus } from "../../../src/compliance.js";
import { secondaryRecommendationId } from "./recommendation-record-utils.js";
import { FallbackTranslationsSection } from "./FallbackTranslationsSection.js";
import { CisRecommendationSummaryDetail, VendorRecommendationDetail } from "./RecommendationDetails.js";
import { BsiDetail } from "./RecommendationsBsiDetail.js";
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
              <span className="compliance-stat compliance-stat--compliant"><span role="img" aria-label="Compliant">✓</span> {report.summary.byStatus.compliant}</span>
              <span className="compliance-stat compliance-stat--gap">Gap {report.summary.byStatus["exact-gap"]}</span>
              <span className="compliance-stat compliance-stat--choice">Choice {report.summary.byStatus["choice-required"]}</span>
              <span className="compliance-stat compliance-stat--param">Param {report.summary.byStatus["parameter-required"]}</span>
              <span className="compliance-stat compliance-stat--unknown"><span role="img" aria-label="Not checkable">?</span> {report.summary.byStatus["not-checkable"]}</span>
            </div>
          ) : null}
          {report?.warnings?.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
          {c.complianceError !== undefined ? <p className="error">{c.complianceError}</p> : null}
          {c.complianceLoading ? <p className="loading-inline" aria-live="polite">Checking compliance…</p> : null}
          {report === undefined && !c.complianceLoading ? <p className="empty-state">No compliance report has been generated yet.</p> : null}
          {report !== undefined && !c.complianceLoading ? (
            <>
              <div className="recommendation-controls">
                <label htmlFor="compliance-search">
                  Search
                  <input id="compliance-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
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
      {props.result.source === "cis" ? <CisRecommendationSummaryDetail recommendation={props.result.recommendation} /> : null}
      {props.result.source === "vendor" ? <VendorRecommendationDetail recommendation={props.result.recommendation} /> : null}
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
              <button
                key={option.id}
                type="button"
                disabled={option.available === false}
                title={option.available === false ? option.unavailableReason : undefined}
                onClick={() => props.onApply(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
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

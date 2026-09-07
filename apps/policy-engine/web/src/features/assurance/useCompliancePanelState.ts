/** Owns local compliance filtering and selected-result state. */
import { useEffect, useMemo, useState } from "react";
import type { ComplianceRecommendationResult, ComplianceReport } from "../../../../src/browser/assurance.js";
import type { RecommendationSource } from "../../../../src/browser/assurance.js";
import { ALL_COMPLIANCE_STATUSES, filterComplianceResults, type ComplianceFilterStatus } from "./compliance-panel-model.js";

export interface CompliancePanelState {
  readonly filteredResults: readonly ComplianceRecommendationResult[];
  readonly query: string;
  readonly selectedResult: ComplianceRecommendationResult | undefined;
  readonly statusFilter: ComplianceFilterStatus;
  readonly setQuery: (query: string) => void;
  readonly setSelectedResultId: (resultId: string | undefined) => void;
  readonly setStatusFilter: (status: ComplianceFilterStatus) => void;
}

export function useCompliancePanelState(
  report: ComplianceReport | undefined,
  sources: readonly RecommendationSource[],
): CompliancePanelState {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ComplianceFilterStatus>(ALL_COMPLIANCE_STATUSES);
  const [selectedResultId, setSelectedResultId] = useState<string>();
  const filteredResults = useMemo(
    () => filterComplianceResults(report?.results ?? [], sources, query, statusFilter),
    [query, report, sources, statusFilter],
  );
  const selectedResult = filteredResults.find((result) => result.id === selectedResultId);

  useEffect(() => {
    if (selectedResultId !== undefined && selectedResult === undefined) {
      setSelectedResultId(undefined);
    }
  }, [selectedResult, selectedResultId]);

  return { filteredResults, query, selectedResult, setQuery, setSelectedResultId, setStatusFilter, statusFilter };
}

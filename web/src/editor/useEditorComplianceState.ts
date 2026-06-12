import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ComplianceReport } from "../../../src/compliance.js";
import type { RecommendationSource } from "../../../src/recommendation-types.js";
import type { AppState, JsonRecord, Selection } from "./types.js";
import { postJson, readJsonResponse } from "./editor-utils.js";
import { DEFAULT_COMPLIANCE_SOURCES } from "./useEditorRecommendationState.js";

const COMPLIANCE_REFRESH_DELAY_MS = 250;

export interface EditorComplianceState {
  readonly complianceSources: RecommendationSource[];
  readonly complianceReport: ComplianceReport | undefined;
  readonly complianceLoading: boolean;
  readonly complianceError: string | undefined;
  readonly setComplianceSources: Dispatch<SetStateAction<RecommendationSource[]>>;
  readonly setComplianceReport: Dispatch<SetStateAction<ComplianceReport | undefined>>;
  readonly setComplianceLoading: Dispatch<SetStateAction<boolean>>;
  readonly setComplianceError: Dispatch<SetStateAction<string | undefined>>;
}

export function useComplianceState(props: {
  readonly selection: Selection | undefined;
  readonly state: AppState | undefined;
}): EditorComplianceState {
  const [complianceSources, setComplianceSources] = useState<RecommendationSource[]>(() => [...DEFAULT_COMPLIANCE_SOURCES]);
  const [complianceReport, setComplianceReport] = useState<ComplianceReport | undefined>();
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceError, setComplianceError] = useState<string | undefined>();

  useComplianceReportRefresh({
    complianceSources,
    selection: props.selection,
    setComplianceError,
    setComplianceLoading,
    setComplianceReport,
    state: props.state,
  });

  return {
    complianceSources,
    complianceReport,
    complianceLoading,
    complianceError,
    setComplianceSources,
    setComplianceReport,
    setComplianceLoading,
    setComplianceError,
  };
}

function useComplianceReportRefresh(props: {
  readonly complianceSources: RecommendationSource[];
  readonly selection: Selection | undefined;
  readonly setComplianceError: Dispatch<SetStateAction<string | undefined>>;
  readonly setComplianceLoading: Dispatch<SetStateAction<boolean>>;
  readonly setComplianceReport: Dispatch<SetStateAction<ComplianceReport | undefined>>;
  readonly state: AppState | undefined;
}): void {
  useEffect(() => {
    if (props.state === undefined || props.selection === undefined || props.complianceSources.length === 0) {
      props.setComplianceReport(undefined);
      props.setComplianceError(undefined);
      props.setComplianceLoading(false);
      return;
    }
    const workspace = props.state.workspace;
    const selection = props.selection;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      props.setComplianceLoading(true);
      props.setComplianceError(undefined);
      void postJson("/api/compliance/check", {
        workspace,
        selection: {
          policyIndex: selection.policyIndex,
          versionIndex: selection.versionIndex,
        },
        sources: props.complianceSources,
      })
        .then(async (response) => {
          const result = await readJsonResponse<{ report?: ComplianceReport } & JsonRecord>(response);
          if (!response.ok || result.report === undefined) {
            throw new Error(JSON.stringify(result));
          }
          if (!cancelled) {
            props.setComplianceReport(result.report);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            props.setComplianceError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            props.setComplianceLoading(false);
          }
        });
    }, COMPLIANCE_REFRESH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    props.complianceSources,
    props.selection,
    props.setComplianceError,
    props.setComplianceLoading,
    props.setComplianceReport,
    props.state?.workspace,
  ]);
}

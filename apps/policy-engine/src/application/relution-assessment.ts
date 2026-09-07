/** Typed application use cases for Relution assessment and report publication. */
import { assessRelutionDevices } from "./relution-assessment-report.js";
import type { RelutionAssessmentCompleteness, RelutionAssessmentReport, RelutionDeviceSummary, RelutionReportPaths } from "../contracts/relution-assessment.js";

export interface RelutionAssessmentStore {
  remember(report: RelutionAssessmentReport): string;
  find(assessmentId: string): RelutionAssessmentReport | undefined;
}

export interface RelutionReportWriter {
  write(report: RelutionAssessmentReport): RelutionReportPaths;
}

export class RelutionAssessmentUnavailableError extends Error {
  constructor() {
    super("Relution assessment is unavailable or expired");
    this.name = "RelutionAssessmentUnavailableError";
  }
}

export function runRelutionAssessment(
  input: { readonly baseUrl: string; readonly devices: readonly RelutionDeviceSummary[]; readonly completeness: RelutionAssessmentCompleteness },
  assessments: RelutionAssessmentStore,
): { readonly report: RelutionAssessmentReport; readonly assessmentId: string } {
  const report = assessRelutionDevices(input.baseUrl, [...input.devices], input.completeness);
  return { report, assessmentId: assessments.remember(report) };
}

export function writeRelutionAssessmentReport(
  assessmentId: string,
  dependencies: { readonly assessments: RelutionAssessmentStore; readonly writer: RelutionReportWriter },
): RelutionReportPaths {
  const report = dependencies.assessments.find(assessmentId);
  if (report === undefined) throw new RelutionAssessmentUnavailableError();
  return dependencies.writer.write(report);
}

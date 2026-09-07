// Runs read-only Relution device queries and turns results into assessment reports.
import type {
  RelutionAssessmentOptions,
  RelutionAssessmentReport,
  RelutionDeviceQueryInput,
  RelutionDeviceQueryResult,
} from "../contracts/relution-assessment.js";
import { assessmentCompleteness, createRelutionAssessmentReport, validateRelutionAssessmentOptions } from "./relution-assessment-report.js";

export interface RelutionAuditPort<Connection> {
  query(connection: Connection, query: RelutionDeviceQueryInput): Promise<RelutionDeviceQueryResult>;
}

export async function auditRelutionDevices<Connection>(
  connection: Connection,
  query: RelutionDeviceQueryInput,
  options: RelutionAssessmentOptions = {},
  port: RelutionAuditPort<Connection>,
): Promise<{ query: RelutionDeviceQueryResult; report: RelutionAssessmentReport }> {
  validateRelutionAssessmentOptions(options);
  const result = await port.query(connection, query);
  return { query: result, report: createRelutionAssessmentReport(result.baseUrl, result.devices, options, assessmentCompleteness(result)) };
}

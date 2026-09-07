/** Implements the Relution device-audit CLI action. */
import { auditRelutionDevices } from "../../application/relution-audit.js";
import { queryRelutionDevices } from "../../integrations/relution/relution-device-query.js";
import type { HttpServiceTransportOptions } from "../../platform/network/http-service-transport.js";
import { writeRelutionReport } from "../../integrations/relution/relution-reports.js";
import { connectionFromArgs } from "./relution-cli-connection.js";
import { optionalInteger, optionalString, type RelutionCliArgs } from "./relution-cli-options.js";
import { absoluteReportPaths, printJson, printReportPaths, warnIfDeviceQueryIncomplete } from "./relution-cli-output.js";
import { expectedPoliciesFromArgs, queryFromArgs } from "./relution-cli-query.js";

export async function runRelutionAuditCommand(args: RelutionCliArgs, transportOptions: HttpServiceTransportOptions): Promise<void> {
  const connection = connectionFromArgs(args);
  const auditOptions: Parameters<typeof auditRelutionDevices>[2] = {};
  const expectedPoliciesByPlatform = expectedPoliciesFromArgs(args);
  const inactiveWarningDays = optionalInteger(args, "inactive-warning-days");
  const inactiveProblemDays = optionalInteger(args, "inactive-problem-days");
  if (expectedPoliciesByPlatform !== undefined) auditOptions.expectedPoliciesByPlatform = expectedPoliciesByPlatform;
  if (inactiveWarningDays !== undefined) auditOptions.inactiveWarningDays = inactiveWarningDays;
  if (inactiveProblemDays !== undefined) auditOptions.inactiveProblemDays = inactiveProblemDays;

  const output = await auditRelutionDevices(connection, queryFromArgs(args), auditOptions, {
    query: (activeConnection, query) => queryRelutionDevices(activeConnection, query, transportOptions),
  });
  warnIfDeviceQueryIncomplete(output.query);
  const workspace = optionalString(args, "workspace");
  const files = workspace === undefined ? undefined : writeRelutionReport(workspace, output.report);
  if (args.options.json === true) {
    printJson(files === undefined || workspace === undefined ? output : { ...output, files: absoluteReportPaths(workspace, files) });
    return;
  }
  console.log(`Devices: ${String(output.report.summary.totalDevices)}`);
  console.log(`Issues: ${String(output.report.summary.issue)}`);
  console.log(`Missing policy: ${String(output.report.summary.missingPolicy)}`);
  console.log(`Inactive ${String(inactiveWarningDays ?? 30)}+: ${String(output.report.summary.inactiveWarning)}`);
  console.log(`Inactive ${String(inactiveProblemDays ?? 90)}+: ${String(output.report.summary.inactiveProblem)}`);
  if (files !== undefined && workspace !== undefined) {
    printReportPaths(workspace, files);
  }
}

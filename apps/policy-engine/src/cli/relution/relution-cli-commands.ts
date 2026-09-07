/** Implements Relution connection, inventory, and assessment CLI actions. */
import { assessmentCompleteness, assessRelutionDevices } from "../../application/relution-assessment-report.js";
import { queryRelutionDevices, testRelutionConnection } from "../../integrations/relution/relution-device-query.js";
import type { HttpServiceTransportOptions } from "../../platform/network/http-service-transport.js";
import { writeRelutionReport } from "../../integrations/relution/relution-reports.js";
import { connectionFromArgs } from "./relution-cli-connection.js";
import type { RelutionCliArgs } from "./relution-cli-options.js";
import { absoluteReportPaths, printJson, printReportPaths, printResult, warnIfDeviceQueryIncomplete } from "./relution-cli-output.js";
import { queryFromArgs } from "./relution-cli-query.js";

export async function runRelutionTestCommand(args: RelutionCliArgs, transportOptions: HttpServiceTransportOptions): Promise<void> {
  const result = await testRelutionConnection(connectionFromArgs(args), transportOptions);
  if (!result.ok) throw new Error(`Relution API connection failed: ${result.reason}`);
  printResult(args, result, `Relution API connection OK: ${result.baseUrl}`);
}

export async function runRelutionDevicesCommand(args: RelutionCliArgs, transportOptions: HttpServiceTransportOptions): Promise<void> {
  const result = await queryRelutionDevices(connectionFromArgs(args), queryFromArgs(args), transportOptions);
  printResult(args, result, `Devices: ${String(result.count)}${result.total === undefined ? "" : ` of ${String(result.total)}`}`);
}

export async function runRelutionAssessCommand(args: RelutionCliArgs, transportOptions: HttpServiceTransportOptions): Promise<void> {
  const connection = connectionFromArgs(args);
  const devices = await queryRelutionDevices(connection, queryFromArgs(args), transportOptions);
  warnIfDeviceQueryIncomplete(devices);
  const report = assessRelutionDevices(connection.baseUrl, devices.devices, assessmentCompleteness(devices));
  const workspace = typeof args.options.workspace === "string" && args.options.workspace.length > 0 ? args.options.workspace : undefined;
  const files = workspace === undefined ? undefined : writeRelutionReport(workspace, report);
  if (args.options.json === true) {
    printJson(files === undefined || workspace === undefined ? { report } : { report, files: absoluteReportPaths(workspace, files) });
    return;
  }
  console.log(`Devices: ${String(report.summary.totalDevices)}`);
  console.log(`Compliant: ${String(report.summary.compliant)}`);
  console.log(`Issues: ${String(report.summary.issue)}`);
  console.log(`Not checkable: ${String(report.summary.notCheckable)}`);
  if (files !== undefined && workspace !== undefined) {
    printReportPaths(workspace, files);
  }
}

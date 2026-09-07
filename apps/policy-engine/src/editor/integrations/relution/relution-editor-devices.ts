/** Handles Relution device queries, audits, and in-memory assessment history. */
import { randomUUID } from "node:crypto";
import { optionalRecord } from "../../editor-api-request-input.js";
import { badRequest } from "../../editor-http-error.js";
import { readJsonBody } from "../../editor-json-body.js";
import { requireRuntimeConnection, sendJson } from "../../editor-routes-utils.js";
import { runRelutionAssessment, type RelutionAssessmentStore } from "../../../application/relution-assessment.js";
import { parseRelutionAssessmentOptions } from "./relution-editor-assessment-input.js";
import { requireRelutionConnection } from "./relution-editor-connection.js";
import type { RelutionEditorRuntime, RelutionRouteHandler } from "./relution-editor-contract.js";
import { parseRelutionDeviceQuery } from "./relution-editor-device-query.js";
import { assessmentCompleteness } from "../../../application/relution-assessment-report.js";
import { auditRelutionDevices } from "../../../application/relution-audit.js";
import { normalizeRelutionDeviceSummary } from "../../../integrations/relution/relution-device-normalization.js";
import { queryRelutionDevices } from "../../../integrations/relution/relution-device-query.js";
import type { RelutionAssessmentReport, RelutionDeviceSummary } from "../../../contracts/relution-assessment.js";

const MAX_CACHED_ASSESSMENTS = 16;

export const handleRelutionDeviceRoute: RelutionRouteHandler = async (url, request, response, runtime, _workspace, allowLocalServiceHosts, transportOptions) => {
  if (url.pathname === "/api/relution/devices/query" && request.method === "POST") {
    const result = await queryRelutionDevices(requireRelutionConnection(runtime, allowLocalServiceHosts), parseRelutionDeviceQuery(await readJsonBody(request)), transportOptions);
    runtime.lastDevices = result.devices;
    runtime.lastDeviceQuery = result;
    sendJson(response, 200, result);
    return true;
  }
  if (url.pathname === "/api/relution/devices/assess" && request.method === "POST") return await sendRelutionAssessment(request, response, runtime);
  if (url.pathname !== "/api/relution/devices/audit" || request.method !== "POST") return false;
  const body = await readJsonBody(request);
  const result = await auditRelutionDevices(requireRelutionConnection(runtime, allowLocalServiceHosts), parseRelutionDeviceQuery(body), parseRelutionAssessmentOptions(body), {
    query: (connection, query) => queryRelutionDevices(connection, query, transportOptions),
  });
  runtime.lastDevices = result.query.devices;
  runtime.lastDeviceQuery = result.query;
  sendJson(response, 200, { ...result, assessmentId: rememberAssessment(runtime, result.report) });
  return true;
};

async function sendRelutionAssessment(request: Parameters<RelutionRouteHandler>[1], response: Parameters<RelutionRouteHandler>[2], runtime: RelutionEditorRuntime): Promise<boolean> {
  const suppliedDevices = parseDevices(await readJsonBody(request));
  const devices = suppliedDevices ?? runtime.lastDevices;
  const completeness = suppliedDevices === undefined && runtime.lastDeviceQuery !== undefined
    ? assessmentCompleteness(runtime.lastDeviceQuery) : assessmentCompleteness({ count: devices.length, truncated: false });
  const connection = requireRuntimeConnection(runtime, "Relution");
  sendJson(response, 200, runRelutionAssessment({ baseUrl: connection.baseUrl, devices, completeness }, relutionAssessmentStore(runtime)));
  return true;
}

function parseDevices(body: Record<string, unknown>): RelutionDeviceSummary[] | undefined {
  const rawDevices = body.devices;
  if (rawDevices === undefined) return undefined;
  if (!Array.isArray(rawDevices)) throw badRequest("Expected devices array");
  return rawDevices.map((entry) => {
    const record = optionalRecord({ entry }, "entry");
    if (record === undefined || typeof record.name !== "string") throw badRequest("Invalid device summary");
    return normalizeRelutionDeviceSummary(record);
  });
}

export function relutionAssessmentStore(runtime: RelutionEditorRuntime): RelutionAssessmentStore {
  return {
    remember: (report) => rememberAssessment(runtime, report),
    find: (assessmentId) => runtime.assessments?.get(assessmentId),
  };
}

function rememberAssessment(runtime: RelutionEditorRuntime, report: RelutionAssessmentReport): string {
  const assessments = runtime.assessments ?? new Map<string, RelutionAssessmentReport>();
  runtime.assessments = assessments;
  while (assessments.size >= MAX_CACHED_ASSESSMENTS) assessments.delete(assessments.keys().next().value as string);
  const assessmentId = randomUUID();
  assessments.set(assessmentId, report);
  return assessmentId;
}

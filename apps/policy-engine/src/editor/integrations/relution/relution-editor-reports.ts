/** Handles persistence of completed Relution assessments and report listings. */
import { requireString } from "../../editor-api-request-input.js";
import { badRequest } from "../../editor-http-error.js";
import { readJsonBody } from "../../editor-json-body.js";
import { sendJson } from "../../editor-routes-utils.js";
import { RelutionAssessmentUnavailableError, writeRelutionAssessmentReport } from "../../../application/relution-assessment.js";
import type { RelutionRouteHandler } from "./relution-editor-contract.js";
import { relutionAssessmentStore } from "./relution-editor-devices.js";
import { listRelutionReports, writeRelutionReport } from "../../../integrations/relution/relution-reports.js";

export const handleRelutionReportRoute: RelutionRouteHandler = async (url, request, response, runtime, workspace) => {
  if (url.pathname === "/api/relution/reports/compliance" && request.method === "POST") {
    const body = await readJsonBody(request);
    if (Object.keys(body).length !== 1 || typeof body.assessmentId !== "string") throw badRequest("Compliance report writes require one assessmentId");
    try {
      sendJson(response, 200, writeRelutionAssessmentReport(requireString(body, "assessmentId"), {
        assessments: relutionAssessmentStore(runtime),
        writer: { write: (report) => writeRelutionReport(workspace, report) },
      }));
    } catch (error) {
      if (error instanceof RelutionAssessmentUnavailableError) throw badRequest(error.message);
      throw error;
    }
    return true;
  }
  if (url.pathname !== "/api/relution/reports" || request.method !== "GET") return false;
  sendJson(response, 200, { reports: listRelutionReports(workspace) });
  return true;
};

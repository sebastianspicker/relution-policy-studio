/** Handles Relution session setup and connection probing routes. */
import { readJsonBody } from "../../editor-json-body.js";
import { sendJson } from "../../editor-routes-utils.js";
import { parseAllowedRelutionConnection, requireRelutionConnection } from "./relution-editor-connection.js";
import type { RelutionRouteHandler } from "./relution-editor-contract.js";
import { publicRelutionSession } from "../../../integrations/relution/relution-connection.js";
import { testRelutionConnection } from "../../../integrations/relution/relution-device-query.js";

export const handleRelutionSessionRoute: RelutionRouteHandler = async (url, request, response, runtime, _workspace, allowLocalServiceHosts, transportOptions) => {
  if (url.pathname === "/api/relution/session" && request.method === "GET") {
    sendJson(response, 200, publicRelutionSession(runtime.connection));
    return true;
  }
  if (url.pathname === "/api/relution/session" && request.method === "POST") {
    runtime.connection = await parseAllowedRelutionConnection(await readJsonBody(request), allowLocalServiceHosts, transportOptions);
    runtime.lastDevices = [];
    delete runtime.lastDeviceQuery;
    runtime.assessments?.clear();
    sendJson(response, 200, publicRelutionSession(runtime.connection));
    return true;
  }
  if (url.pathname !== "/api/relution/test" || request.method !== "POST") return false;
  sendJson(response, 200, await testRelutionConnection(requireRelutionConnection(runtime, allowLocalServiceHosts), transportOptions));
  return true;
};

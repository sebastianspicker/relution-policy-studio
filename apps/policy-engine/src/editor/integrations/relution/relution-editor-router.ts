/** Applies the ordered Relution editor-route chain and namespace fallback. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { isEditorApiNamespace } from "../../editor-api-namespaces.js";
import { sendJson } from "../../editor-routes-utils.js";
import type { HttpServiceTransportOptions } from "../../../platform/network/http-service-transport.js";
import type { RelutionEditorRuntime, RelutionRouteHandler } from "./relution-editor-contract.js";
import { handleRelutionDeviceRoute } from "./relution-editor-devices.js";
import { handleRelutionReportRoute } from "./relution-editor-reports.js";
import { handleRelutionSessionRoute } from "./relution-editor-session.js";

const RELUTION_ROUTE_HANDLERS: readonly RelutionRouteHandler[] = [
  handleRelutionSessionRoute,
  handleRelutionDeviceRoute,
  handleRelutionReportRoute,
];

export async function handleRelutionApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: RelutionEditorRuntime,
  workspace: string,
  allowLocalServiceHosts = false,
  transportOptions: HttpServiceTransportOptions = {},
): Promise<boolean> {
  if (!isEditorApiNamespace(url.pathname, "relution")) return false;
  for (const handler of RELUTION_ROUTE_HANDLERS) {
    if (await handler(url, request, response, runtime, workspace, allowLocalServiceHosts, transportOptions)) return true;
  }
  sendJson(response, 404, { error: `Unknown Relution endpoint: ${request.method ?? "GET"} ${url.pathname}` });
  return true;
}

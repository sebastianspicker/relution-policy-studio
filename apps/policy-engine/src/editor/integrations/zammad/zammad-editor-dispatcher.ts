/** Dispatches authenticated Zammad editor requests in route-precedence order. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { isEditorApiNamespace } from "../../editor-api-namespaces.js";
import { sendJson } from "../../editor-routes-utils.js";
import type { HttpServiceTransportOptions } from "../../../platform/network/http-service-transport.js";
import type { ZammadEditorRuntime } from "./zammad-editor-contract.js";
import {
  handleZammadSessionGet,
  handleZammadSessionPost,
  handleZammadTest,
  handleZammadTickets,
} from "./zammad-editor-route-handlers.js";

export async function handleZammadApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: ZammadEditorRuntime,
  allowLocalServiceHosts = false,
  workspace?: string,
  transportOptions: HttpServiceTransportOptions = {},
): Promise<boolean> {
  if (!isEditorApiNamespace(url.pathname, "zammad")) {
    return false;
  }
  if (url.pathname === "/api/zammad/session" && request.method === "GET") {
    handleZammadSessionGet(response, runtime);
    return true;
  }
  if (url.pathname === "/api/zammad/session" && request.method === "POST") {
    await handleZammadSessionPost(request, response, runtime, allowLocalServiceHosts, transportOptions);
    return true;
  }
  if (url.pathname === "/api/zammad/test" && request.method === "POST") {
    await handleZammadTest(response, runtime, allowLocalServiceHosts, transportOptions);
    return true;
  }
  if (url.pathname === "/api/zammad/tickets" && request.method === "POST") {
    await handleZammadTickets(request, response, runtime, allowLocalServiceHosts, workspace, transportOptions);
    return true;
  }
  sendJson(response, 404, { error: `Unknown Zammad endpoint: ${request.method ?? "GET"} ${url.pathname}` });
  return true;
}

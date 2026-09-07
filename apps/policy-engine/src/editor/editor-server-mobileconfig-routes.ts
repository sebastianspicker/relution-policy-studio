/** Handles bounded, non-mutating mobileconfig inspection requests. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { requireString } from "./editor-api-request-input.js";
import { readJsonBody } from "./editor-json-body.js";
import { sendJson } from "./editor-routes-utils.js";
import { inspectMobileConfigText } from "../platform/serialization/plist-inspection.js";

export async function handleMobileConfigInspectApiRequest(url: URL, request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (url.pathname !== "/api/mobileconfig/inspect" || request.method !== "POST") return false;
  const body = await readJsonBody(request);
  sendJson(response, 200, inspectMobileConfigText(requireString(body, "rawContent")));
  return true;
}

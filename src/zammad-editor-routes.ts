import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, assignOptionalHttpConnectionFields, badRequest, optionalRecord, optionalString, readJsonBody, requireString } from "./editor-server-helpers.js";
import { requireRuntimeConnection, sendJson } from "./editor-routes-utils.js";
import { assertOutboundHostAllowed, outboundHostPolicyError } from "./outbound-host-policy.js";
import {
  createZammadTicket,
  normalizeZammadConnection,
  publicZammadSession,
  testZammadConnection,
  type ZammadConnection,
  type ZammadConnectionInput,
} from "./zammad-api.js";
import type { ZammadTicketDraft } from "./zammad-ticket-drafts.js";

export interface ZammadEditorRuntime {
  connection?: ZammadConnection;
}

export async function handleZammadApiRequest(
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
  runtime: ZammadEditorRuntime,
  allowLocalServiceHosts = false,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/zammad")) {
    return false;
  }
  if (url.pathname === "/api/zammad/session" && request.method === "GET") {
    sendJson(response, 200, publicZammadSession(runtime.connection));
    return true;
  }
  if (url.pathname === "/api/zammad/session" && request.method === "POST") {
    runtime.connection = await parseAllowedZammadConnection(await readJsonBody(request), allowLocalServiceHosts);
    sendJson(response, 200, publicZammadSession(runtime.connection));
    return true;
  }
  if (url.pathname === "/api/zammad/test" && request.method === "POST") {
    sendJson(response, 200, await testZammadConnection(await requireOutboundConnection(runtime, allowLocalServiceHosts)));
    return true;
  }
  if (url.pathname === "/api/zammad/tickets" && request.method === "POST") {
    const draft = parseTicketDraft(await readJsonBody(request));
    sendJson(response, 200, { ticket: await createZammadTicket(await requireOutboundConnection(runtime, allowLocalServiceHosts), draft), draft });
    return true;
  }
  sendJson(response, 404, { error: `Unknown Zammad endpoint: ${request.method ?? "GET"} ${url.pathname}` });
  return true;
}

async function parseAllowedZammadConnection(body: Record<string, unknown>, allowLocalServiceHosts: boolean): Promise<ZammadConnection> {
  const connection = normalizeZammadConnection(parseZammadConnectionInput(body));
  const policyError = await outboundHostPolicyError("Zammad", connection.host, allowLocalServiceHosts);
  if (policyError === undefined) {
    return connection;
  }
  if (policyError.kind === "blocked") {
    console.warn(`[zammad outbound host blocked] ${policyError.reason}`);
    throw badRequest(policyError.reason);
  }
  console.warn(`[zammad outbound host dns-failure] ${policyError.error}`);
  throw new HttpError(502, policyError.error);
}

function parseZammadConnectionInput(body: Record<string, unknown>): ZammadConnectionInput {
  const input: ZammadConnectionInput = {
    host: requireString(body, "host"),
    apiToken: requireString(body, "apiToken"),
    group: requireString(body, "group"),
    customer: requireString(body, "customer"),
  };
  assignOptionalHttpConnectionFields(input, body);
  return input;
}

async function requireOutboundConnection(runtime: ZammadEditorRuntime, allowLocalServiceHosts: boolean): Promise<ZammadConnection> {
  const connection = requireRuntimeConnection(runtime, "Zammad");
  await assertOutboundHostAllowed("Zammad", connection.host, allowLocalServiceHosts);
  return connection;
}

function parseTicketDraft(body: Record<string, unknown>): ZammadTicketDraft {
  const record = optionalRecord(body, "draft");
  if (record === undefined) {
    throw badRequest("Expected draft object");
  }
  const kind = requireString(record, "kind");
  if (kind !== "non-compliant-device" && kind !== "inactive-device") {
    throw badRequest(`Unsupported Zammad ticket kind: ${kind}`);
  }
  if (typeof record.title !== "string" || typeof record.body !== "string" || typeof record.issueId !== "string") {
    throw badRequest("Ticket draft requires title, body, and issueId strings");
  }
  const ticketDraft: ZammadTicketDraft = {
    kind,
    title: requireString(record, "title"),
    body: requireString(record, "body"),
    issueId: requireString(record, "issueId"),
  };
  const deviceUuid = optionalString(record, "deviceUuid");
  if (deviceUuid !== undefined) {
    ticketDraft.deviceUuid = deviceUuid;
  }
  return ticketDraft;
}

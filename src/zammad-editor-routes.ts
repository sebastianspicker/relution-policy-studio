import type { IncomingMessage, ServerResponse } from "node:http";
import { badRequest, optionalString, readJsonBody, requireString } from "./editor-server-helpers.js";
import { optionalHttpProtocol, optionalPort } from "./editor-routes-utils.js";
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

export function createZammadEditorRuntime(): ZammadEditorRuntime {
  return {};
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
    const body = await readJsonBody(request);
    const input: ZammadConnectionInput = {
      host: requireString(body, "host"),
      apiToken: requireString(body, "apiToken"),
      group: requireString(body, "group"),
      customer: requireString(body, "customer"),
    };
    const protocol = optionalHttpProtocol(body);
    const port = optionalPort(body);
    const basePath = optionalString(body, "basePath");
    if (protocol !== undefined) {
      input.protocol = protocol;
    }
    if (port !== undefined) {
      input.port = port;
    }
    if (basePath !== undefined) {
      input.basePath = basePath;
    }
    const connection = normalizeZammadConnection(input);
    const policyError = await outboundHostPolicyError("Zammad", connection.host, allowLocalServiceHosts);
    if (policyError !== undefined) {
      throw badRequest(policyError);
    }
    runtime.connection = connection;
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

function requireConnection(runtime: ZammadEditorRuntime): ZammadConnection {
  if (runtime.connection === undefined) {
    throw badRequest("Zammad API session is not configured");
  }
  return runtime.connection;
}

async function requireOutboundConnection(runtime: ZammadEditorRuntime, allowLocalServiceHosts: boolean): Promise<ZammadConnection> {
  const connection = requireConnection(runtime);
  await assertOutboundHostAllowed("Zammad", connection.host, allowLocalServiceHosts);
  return connection;
}

function parseTicketDraft(body: Record<string, unknown>): ZammadTicketDraft {
  const draft = body.draft;
  if (typeof draft !== "object" || draft === null || Array.isArray(draft)) {
    throw badRequest("Expected draft object");
  }
  const record = draft as Record<string, unknown>;
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

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

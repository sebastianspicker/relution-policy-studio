import type { ZammadTicketDraft } from "./zammad-ticket-drafts.js";

export type ZammadProtocol = "http" | "https";

export interface ZammadConnectionInput {
  protocol?: ZammadProtocol;
  host: string;
  port?: number;
  basePath?: string;
  apiToken: string;
  group: string;
  customer: string;
}

export interface ZammadConnection {
  protocol: ZammadProtocol;
  host: string;
  port?: number;
  basePath: string;
  apiToken: string;
  group: string;
  customer: string;
  baseUrl: string;
}

export interface ZammadPublicSession {
  configured: boolean;
  baseUrl?: string;
  tokenConfigured: boolean;
  group?: string;
  customer?: string;
}

export interface ZammadTicketResult {
  id?: number;
  number?: string;
  title?: string;
  url?: string;
  raw: Record<string, unknown>;
}

export function normalizeZammadConnection(input: ZammadConnectionInput): ZammadConnection {
  const parsed = parseHostInput(input.host);
  const protocol = input.protocol ?? parsed.protocol ?? "https";
  if (protocol !== "http" && protocol !== "https") {
    throw new Error(`Unsupported Zammad protocol: ${String(protocol)}`);
  }
  const host = parsed.host;
  if (host.length === 0) {
    throw new Error("Zammad host is required");
  }
  const apiToken = input.apiToken.trim();
  if (apiToken.length === 0) {
    throw new Error("Zammad API token is required");
  }
  const group = input.group.trim();
  if (group.length === 0) {
    throw new Error("Zammad group is required");
  }
  const customer = input.customer.trim();
  if (customer.length === 0) {
    throw new Error("Zammad customer is required");
  }
  const basePath = normalizeBasePath(input.basePath ?? parsed.basePath ?? "");
  const port = input.port ?? parsed.port;
  if (port !== undefined && (!Number.isSafeInteger(port) || port < 1 || port > 65535)) {
    throw new Error(`Invalid Zammad port: ${String(port)}`);
  }
  const authority = port === undefined ? host : `${host}:${String(port)}`;
  return { protocol, host, ...(port === undefined ? {} : { port }), basePath, apiToken, group, customer, baseUrl: `${protocol}://${authority}${basePath}` };
}

export function publicZammadSession(connection: ZammadConnection | undefined): ZammadPublicSession {
  if (connection === undefined) {
    return { configured: false, tokenConfigured: false };
  }
  return {
    configured: true,
    baseUrl: connection.baseUrl,
    tokenConfigured: connection.apiToken.length > 0,
    group: connection.group,
    customer: connection.customer,
  };
}

export async function testZammadConnection(connection: ZammadConnection): Promise<{ ok: true; baseUrl: string }> {
  await zammadFetch(connection, "/api/v1/users/me", { method: "GET" });
  return { ok: true, baseUrl: connection.baseUrl };
}

export async function createZammadTicket(connection: ZammadConnection, draft: ZammadTicketDraft): Promise<ZammadTicketResult> {
  const response = await zammadFetch(connection, "/api/v1/tickets", {
    method: "POST",
    body: JSON.stringify({
      title: draft.title,
      group: connection.group,
      customer: connection.customer,
      article: {
        subject: draft.title,
        body: draft.body,
        type: "note",
        internal: true,
        content_type: "text/plain",
      },
    }),
  });
  const raw = await response.json() as Record<string, unknown>;
  const id = typeof raw.id === "number" ? raw.id : undefined;
  const number = typeof raw.number === "string" ? raw.number : undefined;
  const title = typeof raw.title === "string" ? raw.title : undefined;
  return {
    ...(id === undefined ? {} : { id }),
    ...(number === undefined ? {} : { number }),
    ...(title === undefined ? {} : { title }),
    ...(id === undefined ? {} : { url: `${connection.baseUrl}/#ticket/zoom/${String(id)}` }),
    raw,
  };
}

async function zammadFetch(connection: ZammadConnection, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...init,
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "Authorization": `Token token=${connection.apiToken}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Zammad API request failed: ${String(response.status)} ${response.statusText}`);
  }
  return response;
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }
  return `/${trimmed.replace(/^\/+|\/+$/gu, "")}`;
}

function parseHostInput(value: string): { protocol?: ZammadProtocol; host: string; port?: number; basePath?: string } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { host: "" };
  }
  const urlText = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(urlText);
    const protocol = parsed.protocol === "http:" ? "http" : parsed.protocol === "https:" ? "https" : undefined;
    const port = parsed.port.length === 0 ? undefined : Number(parsed.port);
    const basePath = parsed.pathname === "/" ? undefined : parsed.pathname;
    return {
      ...(protocol === undefined || !/^https?:\/\//iu.test(trimmed) ? {} : { protocol }),
      host: parsed.hostname,
      ...(port === undefined ? {} : { port }),
      ...(basePath === undefined ? {} : { basePath }),
    };
  } catch {
    return { host: trimmed.replace(/^https?:\/\//iu, "").replace(/\/.*$/u, "") };
  }
}

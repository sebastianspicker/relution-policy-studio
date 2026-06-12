import type { ZammadTicketDraft } from "./zammad-ticket-drafts.js";
import { normalizeHttpConnectionInput } from "./connection-normalization.js";
import { asRecord } from "./utils/json-guards.js";

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

export class ZammadNetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZammadNetworkError";
  }
}

interface ZammadTicketResultBase {
  title?: string;
  url?: string;
  raw: Record<string, unknown>;
}

export type ZammadTicketResult = ZammadTicketResultBase & (
  | { id: number; number?: string }
  | { id?: number; number: string }
);

export type ZammadConnectionTestResult =
  | { ok: true; baseUrl: string }
  | { ok: false; baseUrl: string; reason: string };

export function normalizeZammadConnection(input: ZammadConnectionInput): ZammadConnection {
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
  const connection = normalizeHttpConnectionInput({ ...input, serviceName: "Zammad" });
  return { ...connection, apiToken, group, customer };
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

export async function testZammadConnection(connection: ZammadConnection): Promise<ZammadConnectionTestResult> {
  const response = await zammadFetch(connection, "/api/v1/users/me", { method: "GET" });
  let rawValue: unknown;
  try {
    rawValue = await response.json() as unknown;
  } catch {
    return {
      ok: false,
      baseUrl: connection.baseUrl,
      reason: "Zammad connection test returned an unexpected current-user response.",
    };
  }
  const raw = asRecord(rawValue);
  const hasAuthenticatedUser = typeof raw?.id === "number"
    && Number.isFinite(raw.id)
    && typeof raw.login === "string"
    && raw.login.trim().length > 0;
  if (!hasAuthenticatedUser) {
    return {
      ok: false,
      baseUrl: connection.baseUrl,
      reason: "Zammad connection test returned an unexpected current-user response.",
    };
  }
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
  let rawValue: unknown;
  try {
    rawValue = await response.json() as unknown;
  } catch {
    throw new Error("Zammad ticket creation returned invalid JSON");
  }
  if (typeof rawValue !== "object" || rawValue === null || Array.isArray(rawValue)) {
    throw new Error("Zammad ticket creation returned a non-object response");
  }
  const raw = rawValue as Record<string, unknown>;
  const id = typeof raw.id === "number" && Number.isFinite(raw.id) ? raw.id : undefined;
  const number = typeof raw.number === "string" && raw.number.trim().length > 0 ? raw.number : undefined;
  const title = typeof raw.title === "string" ? raw.title : undefined;
  const result = {
    ...(title === undefined ? {} : { title }),
    ...(id === undefined ? {} : { url: `${connection.baseUrl}/#ticket/zoom/${String(id)}` }),
    raw,
  };
  if (id !== undefined) {
    return { ...result, id, ...(number === undefined ? {} : { number }) };
  }
  if (number !== undefined) {
    return { ...result, number };
  }
  throw new Error("Zammad ticket creation returned no ticket id or number");
}

async function zammadFetch(connection: ZammadConnection, path: string, init: RequestInit): Promise<Response> {
  const url = zammadRequestUrl(connection, path);
  let response: Response;
  try {
    response = await fetchZammadUrl(connection, url, {
      ...init,
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "Authorization": `Token token=${connection.apiToken}`,
        ...init.headers,
      },
    });
  } catch (error) {
    throw new ZammadNetworkError(`Zammad API request failed before an HTTP response: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`Zammad API request failed: ${String(response.status)} ${response.statusText}`);
  }
  return response;
}

function zammadRequestUrl(connection: ZammadConnection, path: string): URL {
  const origin = `${connection.protocol}://${connection.port === undefined ? connection.host : `${connection.host}:${String(connection.port)}`}`;
  const url = new URL(`${connection.basePath}${path}`, origin);
  if (url.protocol !== `${connection.protocol}:` || url.hostname !== connection.host || url.pathname !== `${connection.basePath}${path}`) {
    throw new Error(`Zammad API path resolves outside the configured service root: ${path}`);
  }
  return url;
}

async function fetchZammadUrl(connection: ZammadConnection, url: URL, init: RequestInit): Promise<Response> {
  assertZammadServiceUrl(connection, url);
  const fetchImpl = globalThis.fetch;
  return await fetchImpl(url, init);
}

function assertZammadServiceUrl(connection: ZammadConnection, url: URL): void {
  if (
    url.protocol !== `${connection.protocol}:`
    || url.hostname !== connection.host
    || url.port !== expectedUrlPort(connection.protocol, connection.port)
    || !url.pathname.startsWith(connection.basePath)
  ) {
    throw new Error(`Zammad API URL resolves outside the configured service root: ${url.href}`);
  }
}

function expectedUrlPort(protocol: ZammadProtocol, port: number | undefined): string {
  if (port === undefined || (protocol === "https" && port === 443) || (protocol === "http" && port === 80)) {
    return "";
  }
  return String(port);
}

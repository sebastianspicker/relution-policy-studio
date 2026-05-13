import type { ZammadTicketDraft } from "./zammad-ticket-drafts.js";
import { normalizeHttpConnectionInput } from "./connection-normalization.js";

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

export interface ZammadTicketResult {
  id?: number;
  number?: string;
  title?: string;
  url?: string;
  raw: Record<string, unknown>;
}

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
  let response: Response;
  try {
    response = await fetch(`${connection.baseUrl}${path}`, {
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

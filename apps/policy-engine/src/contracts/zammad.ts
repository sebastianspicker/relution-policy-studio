/** Neutral DTOs shared by Zammad adapters, application use cases, and browser projections. */

type ZammadProtocol = "http" | "https";

export interface ZammadConnectionInput {
  protocol?: ZammadProtocol;
  host: string;
  port?: number;
  basePath?: string;
  apiToken: string;
  group: string;
  customer: string;
  allowLocalServiceHosts?: boolean;
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
  allowLocalServiceHosts: boolean;
}

export interface ZammadPublicSession {
  configured: boolean;
  baseUrl?: string;
  tokenConfigured: boolean;
  group?: string;
  customer?: string;
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

export interface ZammadTicketDraft {
  kind: "non-compliant-device" | "inactive-device";
  title: string;
  body: string;
  deviceUuid?: string;
  issueId: string;
}

/** Stable operation failures emitted by the Zammad integration, independent of any transport. */
export type ZammadOperationErrorContext =
  | { readonly kind: "uncertain-outcome"; readonly operationId: string }
  | { readonly kind: "store-capacity" }
  | { readonly kind: "store-busy" };

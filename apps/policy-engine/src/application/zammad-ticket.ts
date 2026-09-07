/** Typed application use case for idempotent Zammad ticket creation. */
import { createHash } from "node:crypto";
import type { ZammadConnection, ZammadTicketDraft, ZammadTicketResult } from "../contracts/zammad.js";

export interface ZammadTicketPort {
  create(connection: ZammadConnection, draft: ZammadTicketDraft, operationId: string): Promise<ZammadTicketResult>;
}

export async function createZammadTicket(
  input: { readonly connection: ZammadConnection; readonly draft: ZammadTicketDraft },
  port: ZammadTicketPort,
): Promise<{ readonly ticket: ZammadTicketResult; readonly draft: ZammadTicketDraft; readonly operationId: string }> {
  const operationId = zammadTicketOperationId(input.connection, input.draft);
  return {
    ticket: await port.create(input.connection, input.draft, operationId),
    draft: input.draft,
    operationId,
  };
}

function zammadTicketOperationId(connection: ZammadConnection, draft: ZammadTicketDraft): string {
  const material = JSON.stringify({
    destination: { baseUrl: connection.baseUrl, group: connection.group, customer: connection.customer },
    draft: { kind: draft.kind, title: draft.title, body: draft.body, deviceUuid: draft.deviceUuid ?? null, issueId: draft.issueId },
  });
  return `relution-op-${createHash("sha256").update(material, "utf8").digest("hex")}`;
}

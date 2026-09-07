/** Coordinates idempotent Zammad ticket creation, reconciliation, and persistence. */
import { createZammadTicket } from "./zammad-api-ticket.js";
import { findZammadTicketByOperationId } from "./zammad-api-reconciliation.js";
import type { ZammadConnection, ZammadTicketResult } from "../../contracts/zammad.js";
import type { ZammadTicketDraft } from "../../contracts/zammad.js";
import type { HttpServiceTransportOptions } from "../../platform/network/http-service-transport.js";
import { resultFromRecord } from "./zammad-operation-identities.js";
import { readOperation } from "./zammad-operation-file.js";
import { claimOperation, persistCompleted } from "./zammad-operation-store.js";
import { uncertainZammadOperationOutcome } from "./zammad-operation-error.js";

/** A workspace-local idempotency boundary for ticket creation. */
export class ZammadTicketOperations {
  private readonly inFlight = new Map<string, Promise<ZammadTicketResult>>();
  private readonly completed = new Map<string, ZammadTicketResult>();

  constructor(private readonly workspace: string, private readonly transportOptions: HttpServiceTransportOptions = {}) {}

  async create(connection: ZammadConnection, draft: ZammadTicketDraft, operationId: string): Promise<ZammadTicketResult> {
    const remembered = this.completed.get(operationId);
    if (remembered !== undefined) return remembered;
    const active = this.inFlight.get(operationId);
    if (active !== undefined) return await active;
    const operation = this.createOnce(connection, draft, operationId);
    this.inFlight.set(operationId, operation);
    try {
      const result = await operation;
      this.completed.set(operationId, result);
      return result;
    } finally { this.inFlight.delete(operationId); }
  }

  private async createOnce(connection: ZammadConnection, draft: ZammadTicketDraft, operationId: string): Promise<ZammadTicketResult> {
    const claim = claimOperation(this.workspace, operationId);
    if (claim.operation.state === "completed") return resultFromRecord(claim.operation.result, connection);
    if (!claim.created) {
      const latest = readOperation(this.workspace, operationId);
      if (latest?.state === "completed") return resultFromRecord(latest.result, connection);
      const reconciled = await findZammadTicketByOperationId(connection, operationId, this.transportOptions);
      if (reconciled === undefined) throw uncertainZammadOperationOutcome(operationId);
      return persistCompleted(this.workspace, operationId, reconciled, connection);
    }
    const created = await createZammadTicket(connection, draft, this.transportOptions, operationId);
    return persistCompleted(this.workspace, operationId, created, connection);
  }
}

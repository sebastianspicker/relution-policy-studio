/** Coordinates idempotent Zammad ticket creation, reconciliation, and persistence. */
import { createZammadTicket, zammadDraftContainsOperationMarker } from "./zammad-api-ticket.js";
import { ServiceApiStatusError } from "../../platform/network/service-api-request.js";
import { findZammadTicketByOperationId } from "./zammad-api-reconciliation.js";
import type { ZammadConnection, ZammadTicketResult } from "../../contracts/zammad.js";
import type { ZammadTicketDraft } from "../../contracts/zammad.js";
import type { HttpServiceTransportOptions } from "../../platform/network/http-service-transport.js";
import { resultFromRecord } from "./zammad-operation-identities.js";
import { readOperation } from "./zammad-operation-file.js";
import { claimOperation, persistCompleted, releaseStartedOperation } from "./zammad-operation-store.js";
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
    // Rejected before the claim, so an invalid draft never leaves a record behind.
    if (zammadDraftContainsOperationMarker(draft)) {
      throw new Error("Ticket draft title and body must not contain reserved Relution operation-marker lines");
    }
    const claim = claimOperation(this.workspace, operationId);
    if (claim.operation.state === "completed") return resultFromRecord(claim.operation.result, connection);
    if (!claim.created) {
      const latest = readOperation(this.workspace, operationId);
      if (latest?.state === "completed") return resultFromRecord(latest.result, connection);
      const reconciled = await findZammadTicketByOperationId(connection, operationId, this.transportOptions);
      if (reconciled === undefined) throw uncertainZammadOperationOutcome(operationId);
      return persistCompleted(this.workspace, operationId, reconciled, connection);
    }
    let created: ZammadTicketResult;
    try {
      created = await createZammadTicket(connection, draft, this.transportOptions, operationId);
    } catch (error) {
      // A 4xx answer means Zammad refused the ticket. Network errors, timeouts (including a proxy's 408 or 499
      // after forwarding), 5xx answers and unreadable success bodies keep the claim, because the ticket may exist.
      const refused = error instanceof ServiceApiStatusError && error.status >= 400 && error.status < 500
        && error.status !== 408 && error.status !== 499;
      if (refused) {
        releaseStartedOperation(this.workspace, operationId);
      }
      throw error;
    }
    return persistCompleted(this.workspace, operationId, created, connection);
  }
}

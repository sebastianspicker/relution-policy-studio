/** Declares the mutable Zammad state owned by the editor server runtime. */
import type { ZammadConnection } from "../../../contracts/zammad.js";
import type { ZammadTicketOperations } from "../../../integrations/zammad/zammad-ticket-operations.js";

export interface ZammadEditorRuntime {
  connection?: ZammadConnection;
  ticketOperations?: ZammadTicketOperations;
}

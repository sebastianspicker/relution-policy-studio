/** Browser-safe external-audit response contracts and presentation helpers. */
export type { RelutionAssessmentIssue, RelutionDeviceAssessment, RelutionAssessmentReport, RelutionDeviceQueryResult, RelutionPublicSession } from "../integrations/relution/relution-api-types.js";
export type { ZammadPublicSession, ZammadTicketResult } from "../contracts/zammad.js";
export type { ZammadTicketDraft } from "../contracts/zammad.js";
export { buildZammadTicketDraft } from "./zammad-ticket-drafts.js";

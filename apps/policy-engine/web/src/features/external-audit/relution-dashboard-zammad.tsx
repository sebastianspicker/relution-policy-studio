import type { JSX } from "react";
import { ZammadConnectionForm } from "./relution-dashboard-zammad-connection.js";
import { ZammadTicketDraftSection, ZammadTicketResultMessage } from "./relution-dashboard-zammad-ticket.js";
import { StatusChip } from "../../ui/StatusChip.js";

import type { ZammadSectionProps } from "./relution-dashboard-zammad-contract.js";
export type { ZammadSectionProps } from "./relution-dashboard-zammad-contract.js";

export function ZammadSection(props: ZammadSectionProps): JSX.Element {
  return (
    <details className="audit-disclosure audit-disclosure--external">
      <summary>
        <span>Zammad ticketing</span>
        <StatusChip kind="warning">External write</StatusChip>
      </summary>
      <div className="zammad-content">
        <p className="status">
          {props.session.configured ? `Zammad ${props.session.baseUrl ?? "configured"}` : "No Zammad API session configured"}
        </p>
        <p className="zammad-warning">Ticket creation writes to the configured Zammad instance and always requires confirmation.</p>
        <ZammadConnectionForm {...props} />
        <ZammadTicketDraftSection {...props} />
        <ZammadTicketResultMessage result={props.result} />
      </div>
    </details>
  );
}

import type { JSX } from "react";
import type { ZammadTicketResult } from "../../../../src/browser/integrations.js";
import type { ZammadTicketDraftProps } from "./relution-dashboard-zammad-contract.js";

export function ZammadTicketDraftSection(props: ZammadTicketDraftProps): JSX.Element | null {
  if (props.draft === undefined) return null;
  const destination = props.session.baseUrl ?? props.host;
  return (
    <div className="ticket-draft">
      <h3>{props.draft.title}</h3>
      <pre>{props.draft.body}</pre>
      {props.confirming ? (
        <div className="ticket-confirmation" role="group" aria-label="Confirm Zammad ticket creation">
          <p>Create one ticket in {destination || "the configured Zammad instance"}, group {props.group}, for {props.customer}?</p>
          <button type="button" disabled={props.loading || props.result !== undefined} onClick={props.onCreate}>Confirm and create ticket</button>
          <button type="button" disabled={props.loading} onClick={props.onCancel}>Cancel</button>
        </div>
      ) : (
        <button type="button" disabled={props.loading || !props.session.configured || props.result !== undefined} onClick={props.onReview}>
          Review ticket destination
        </button>
      )}
    </div>
  );
}

export function ZammadTicketResultMessage(props: { readonly result: ZammadTicketResult | undefined }): JSX.Element | null {
  return props.result === undefined ? null : <p className="ok">Ticket created: {zammadTicketIdentifier(props.result)}</p>;
}

function zammadTicketIdentifier(ticket: ZammadTicketResult): string {
  return typeof ticket.number === "string" && ticket.number.trim().length > 0 ? ticket.number : String(ticket.id);
}

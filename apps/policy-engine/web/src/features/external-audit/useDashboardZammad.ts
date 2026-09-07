/** Owns Zammad session and explicitly confirmed ticket state transitions. */
import { useRef, useState } from "react";
import type { ZammadPublicSession, ZammadTicketResult } from "../../../../src/browser/integrations.js";
import type { ZammadTicketDraft } from "../../../../src/browser/integrations.js";
import { optionalPort } from "./relution-dashboard-input.js";
import {
  connectionTestFailureMessage,
  requestDashboardJson,
  requiredZammadTicket,
} from "./relution-dashboard-request.js";
import type { ConnectionTestResponse } from "./relution-dashboard-types.js";
import { useDashboardConnectionFields } from "./useDashboardConnectionFields.js";
import type { DashboardRequestInvalidator, DashboardRequestRunner } from "./useLatestDashboardRequest.js";

export function useDashboardZammad(run: DashboardRequestRunner, invalidate: DashboardRequestInvalidator) {
  const connection = useDashboardConnectionFields();
  const [group, setGroup] = useState("IT");
  const [customer, setCustomer] = useState("");
  const [session, setSession] = useState<ZammadPublicSession>({ configured: false, tokenConfigured: false });
  const [draft, setDraft] = useState<ZammadTicketDraft>();
  const [result, setResult] = useState<ZammadTicketResult>();
  const [confirming, setConfirming] = useState(false);
  const createInFlight = useRef(false);

  function clearTicketState(): void {
    setDraft(undefined);
    setResult(undefined);
    setConfirming(false);
  }

  async function submitSession(): Promise<void> {
    await run("zammad-session", async (isCurrent) => {
      const response = await requestDashboardJson<ZammadPublicSession & { error?: string }>("/api/zammad/session", {
        protocol: connection.protocol,
        host: connection.host,
        port: optionalPort(connection.port),
        apiToken: connection.token,
        group,
        customer,
      });
      if (isCurrent()) {
        setSession(response);
        connection.setToken("");
        clearTicketState();
      }
    }, ["zammad-ticket"]);
  }

  async function testConnection(): Promise<void> {
    await run("zammad-session", async (isCurrent) => {
      const response = await requestDashboardJson<ConnectionTestResponse>("/api/zammad/test", {});
      if (response.ok === false) throw new Error(connectionTestFailureMessage(response));
      if (isCurrent()) {
        setSession((current) => ({
          ...current,
          configured: true,
          ...(response.baseUrl === undefined ? {} : { baseUrl: response.baseUrl }),
          tokenConfigured: true,
        }));
      }
    });
  }

  async function createTicket(): Promise<void> {
    if (draft === undefined || result !== undefined || createInFlight.current) return;
    createInFlight.current = true;
    try {
      await run("zammad-ticket", async (isCurrent) => {
        const response = await requestDashboardJson<{ ticket?: ZammadTicketResult; error?: string }>("/api/zammad/tickets", { draft });
        const ticket = requiredZammadTicket(response);
        if (isCurrent()) setResult(ticket);
      });
    } finally {
      createInFlight.current = false;
    }
  }

  function selectTicketDraft(nextDraft: ZammadTicketDraft): void {
    invalidate("zammad-ticket");
    setDraft(nextDraft);
    setResult(undefined);
    setConfirming(false);
  }

  return {
    ...connection, group, setGroup,
    customer, setCustomer, session, draft, result, confirming, clearTicketState,
    submitSession, testConnection, createTicket, selectTicketDraft,
    reviewTicket: () => setConfirming(true), cancelTicket: () => setConfirming(false),
  };
}

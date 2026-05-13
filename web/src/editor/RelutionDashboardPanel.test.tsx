import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RelutionDashboardPanel } from "./RelutionDashboardPanel.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RelutionDashboardPanel", () => {
  it("stores sessions, audits devices, writes a report, and creates a Zammad ticket", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (url === "/api/relution/session") {
        return jsonResponse({ configured: true, baseUrl: "https://relution.example.test", tokenConfigured: true, mode: "read-only" });
      }
      if (url === "/api/relution/devices/audit") {
        const query = {
          baseUrl: "https://relution.example.test",
          count: 1,
          devices: [
            {
              uuid: "DEVICE-1",
              name: "Campus iPad",
              platform: "IOS",
              status: "COMPLIANT",
              policyStatus: "APPLIED",
              assignedPolicies: ["Other Policy"],
              inactiveDays: 95,
              raw: {},
            },
          ],
        };
        return jsonResponse({
          query,
          report: {
            generatedAt: "2026-04-26T10:00:00.000Z",
            baseUrl: "https://relution.example.test",
            summary: {
              totalDevices: 1,
              compliant: 0,
              issue: 1,
              notCheckable: 0,
              missingPolicy: 1,
              inactiveWarning: 0,
              inactiveProblem: 1,
              byPlatform: { IOS: 1 },
              byStatus: { COMPLIANT: 1 },
              byPolicyStatus: { APPLIED: 1 },
            },
            devices: [
              {
                status: "issue",
                device: query.devices[0],
                issues: [
                  {
                    id: "missing-policy",
                    severity: "problem",
                    message: "Missing expected policies: Baseline iOS.",
                    evidence: { missingPolicies: "Baseline iOS" },
                  },
                ],
              },
            ],
          },
        });
      }
      if (url === "/api/relution/reports/compliance") {
        return jsonResponse({ jsonPath: "/tmp/report.json", markdownPath: "/tmp/report.md" });
      }
      if (url === "/api/zammad/session") {
        return jsonResponse({ configured: true, baseUrl: "https://zammad.example.test", tokenConfigured: true, group: "IT", customer: "it@example.test" });
      }
      if (url === "/api/zammad/tickets") {
        return jsonResponse({ ticket: { id: 42, number: "240042", raw: {} } });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });

    render(<RelutionDashboardPanel />);

    fireEvent.change(screen.getAllByLabelText(/server/i)[0]!, { target: { value: "relution.example.test" } });
    fireEvent.change(screen.getAllByLabelText(/api token/i)[0]!, { target: { value: "secret-token" } });
    fireEvent.click(screen.getByRole("button", { name: /set session/i }));

    await screen.findByText(/relution https:\/\/relution\.example\.test \| read-only/i);
    expect(screen.queryByDisplayValue("secret-token")).toBeNull();

    fireEvent.change(screen.getByLabelText(/expected policies/i), { target: { value: "IOS=Baseline iOS" } });
    fireEvent.click(screen.getByRole("button", { name: /run audit/i }));
    await screen.findByText(/campus ipad/i);
    await screen.findByText(/missing policy 1/i);

    fireEvent.click(screen.getByRole("button", { name: /write report/i }));
    await waitFor(() => expect(screen.getByText(/report written: \/tmp\/report\.md/i)).toBeTruthy());

    fireEvent.change(screen.getAllByLabelText(/server/i)[1]!, { target: { value: "zammad.example.test" } });
    fireEvent.change(screen.getAllByLabelText(/api token/i)[1]!, { target: { value: "zammad-token" } });
    fireEvent.change(screen.getByLabelText(/customer/i), { target: { value: "it@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: /set zammad/i }));
    await screen.findByText(/zammad https:\/\/zammad\.example\.test/i);

    fireEvent.click(screen.getByRole("button", { name: /ticket: missing-policy/i }));
    await screen.findByText(/MDM non-compliance: Campus iPad/i);
    fireEvent.click(screen.getByRole("button", { name: /create ticket/i }));
    await screen.findByText(/ticket created: 240042/i);
  });

  it("rejects malformed audit filters before calling the audit endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (url === "/api/relution/session") {
        return jsonResponse({ configured: true, baseUrl: "https://relution.example.test", tokenConfigured: true, mode: "read-only" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<RelutionDashboardPanel />);

    fireEvent.change(screen.getAllByLabelText(/server/i)[0]!, { target: { value: "relution.example.test" } });
    fireEvent.change(screen.getAllByLabelText(/api token/i)[0]!, { target: { value: "secret-token" } });
    fireEvent.click(screen.getByRole("button", { name: /set session/i }));
    await screen.findByText(/relution https:\/\/relution\.example\.test \| read-only/i);

    fireEvent.change(screen.getByLabelText(/platforms/i), { target: { value: "IOS,<script>" } });
    fireEvent.click(screen.getByRole("button", { name: /run audit/i }));

    await screen.findByText(/invalid relution platform: <script>/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

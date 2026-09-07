/** Prevents stale dashboard responses from overwriting the newest request's state. */
import { useRef, useState } from "react";
import type { RequestDomain } from "./relution-dashboard-types.js";

const REQUEST_DOMAINS: readonly RequestDomain[] = ["relution-session", "relution-audit", "relution-report", "zammad-session", "zammad-ticket"];
export type DashboardRequestTask = (isCurrent: () => boolean) => Promise<void>;
export type DashboardRequestRunner = (domain: RequestDomain, task: DashboardRequestTask, invalidatedDomains?: readonly RequestDomain[]) => Promise<void>;
export type DashboardRequestInvalidator = (domain: RequestDomain) => void;

export function useLatestDashboardRequest(): { readonly loading: boolean; readonly error: string | undefined; readonly run: (domain: RequestDomain, task: DashboardRequestTask, invalidatedDomains?: readonly RequestDomain[]) => Promise<void>; readonly invalidate: (domain: RequestDomain) => void } {
  const activeRequestCount = useRef(0);
  const latestRequest = useRef<Record<RequestDomain, number>>(Object.fromEntries(REQUEST_DOMAINS.map((domain) => [domain, 0])) as Record<RequestDomain, number>);
  const nextRequestId = useRef(0);
  const latestErrorRequestId = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  function invalidate(domain: RequestDomain): void { latestRequest.current[domain] = ++nextRequestId.current; }
  async function run(domain: RequestDomain, task: DashboardRequestTask, invalidatedDomains: readonly RequestDomain[] = []): Promise<void> {
    for (const invalidatedDomain of invalidatedDomains) invalidate(invalidatedDomain);
    const requestId = ++nextRequestId.current;
    latestRequest.current[domain] = requestId;
    latestErrorRequestId.current = requestId;
    activeRequestCount.current += 1;
    setLoading(true); setError(undefined);
    try { await task(() => latestRequest.current[domain] === requestId); }
    catch (taskError) { if (latestErrorRequestId.current === requestId) setError(taskError instanceof Error ? taskError.message : String(taskError)); }
    finally { activeRequestCount.current -= 1; setLoading(activeRequestCount.current > 0); }
  }
  return { loading, error, run, invalidate };
}

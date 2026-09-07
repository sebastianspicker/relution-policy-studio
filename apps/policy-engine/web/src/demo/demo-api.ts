/** Implements the Pages-only API boundary. It never delegates a request to the network. */
import { browseRecommendationCatalog } from "../../../src/browser/assurance.js";
import type { PolicyWorkspace } from "../../../src/browser/workspace.js";
import type { AppState } from "../shared/editor-contracts.js";
import { createDemoAppState, demoBaselineExpertOptions, demoBaselineOptions, demoBaselineRuleset, demoComplianceReport, demoRecommendationCatalog, demoRecommendationIndex } from "./demo-data.js";

export class DemoApi {
  #state: AppState = createDemoAppState();
  #revision = 1;

  reset(): void { this.#state = createDemoAppState(); this.#revision = 1; }
  snapshot(): AppState { return structuredClone(this.#state); }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = requestUrl(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = await requestBody(input, init);
    if (url.origin !== demoOrigin() || !url.pathname.startsWith("/api/")) return reply(403, { error: "Demo API blocks all non-API and cross-origin requests." });
    if (url.pathname === "/api/state" && method === "GET") return reply(200, this.snapshot());
    if (url.pathname === "/api/recommendations" && method === "GET") return reply(200, demoRecommendationIndex());
    if (url.pathname.startsWith("/api/recommendations/") && method === "GET") {
      const [source = "", operation, ...tail] = url.pathname.slice("/api/recommendations/".length).split("/");
      if (!["bsi", "cis", "vendor"].includes(source)) return reply(404, { error: "Unknown recommendation source" });
      const catalog = demoRecommendationCatalog(source);
      if (operation === undefined) return reply(200, catalog);
      if (operation === "browse" && tail.length === 0) return reply(200, browseRecommendationCatalog(catalog));
      if (operation === "ruleset" && tail.length === 0) return reply(catalog.ruleset === undefined ? 404 : 200, catalog.ruleset ?? { error: "Ruleset unavailable" });
      if (operation === "records" && tail.length === 1) {
        let id: string;
        try { id = decodeURIComponent(tail[0]!); }
        catch { return reply(400, { error: "Malformed recommendation identifier" }); }
        const record = catalog.recommendations.find((item) => item.id === id);
        return reply(record === undefined ? 404 : 200, record ?? { error: "Recommendation not found" });
      }
      return reply(404, { error: "Unknown recommendation endpoint" });
    }
    if (url.pathname === "/api/baseline-templates" && method === "GET") return reply(200, demoBaselineOptions());
    if (url.pathname === "/api/baseline-templates/expert" && method === "GET") return reply(200, demoBaselineExpertOptions());
    if (url.pathname === "/api/baseline-templates/template" && method === "GET") return reply(200, demoBaselineRuleset());
    if (url.pathname === "/api/workspace/validate" && method === "POST") return reply(200, { validation: this.#state.validation });
    if (url.pathname === "/api/workspace" && method === "POST") return this.replaceWorkspace(body);
    if (url.pathname === "/api/compliance/check" && method === "POST") return reply(200, { report: demoComplianceReport(this.#state.workspace, policyIndex(this.#state.workspace, body), versionIndex(body)), revision: this.#state.revision });
    if (url.pathname === "/api/compliance/apply" && method === "POST") return this.applyRemediation();
    if (url.pathname === "/api/add-configuration" && method === "POST") return this.addConfiguration(body);
    if (url.pathname === "/api/configuration/move" && method === "POST") return this.mutateConfiguration(body, (items, index) => { const next = index + (body.direction === "up" ? -1 : 1); if (next >= 0 && next < items.length) [items[index], items[next]] = [items[next]!, items[index]!]; });
    if (url.pathname === "/api/configuration/remove" && method === "POST") return this.mutateConfiguration(body, (items, index) => items.splice(index, 1));
    if (url.pathname === "/api/add-policy" && method === "POST") return this.addPolicy(body);
    if (url.pathname.startsWith("/api/relution/") || url.pathname.startsWith("/api/zammad/") || ["/api/build", "/api/import", "/api/output", "/api/key"].includes(url.pathname)) return denied(url.pathname);
    return reply(404, { error: `Demo API has no in-memory handler for ${method} ${url.pathname}.` });
  }

  private replaceWorkspace(body: Record<string, unknown>): Response {
    if (!isWorkspace(body.workspace)) return reply(400, { error: "Demo workspace update requires a workspace payload." });
    this.#state = { ...this.#state, workspace: structuredClone(body.workspace), revision: this.nextRevision() };
    return reply(200, workspaceReply(this.#state));
  }

  private addConfiguration(body: Record<string, unknown>): Response {
    const type = typeof body.type === "string" ? body.type : "IOS_PASSCODE";
    return this.mutateConfiguration(body, (items) => { const uuid = `demo-${type.toLowerCase()}-${items.length + 1}`; items.push({ uuid, details: { uuid, type } }); }, true);
  }

  private mutateConfiguration(body: Record<string, unknown>, mutate: (items: unknown[], index: number) => void, allowsAppend = false): Response {
    const workspace = structuredClone(this.#state.workspace);
    const target = targetConfiguration(workspace, body);
    if (target === undefined || (!allowsAppend && (target.index < 0 || target.index >= target.items.length))) return reply(400, { error: "Demo configuration target was not found." });
    mutate(target.items, target.index);
    return this.commit(workspace);
  }

  private addPolicy(body: Record<string, unknown>): Response {
    const workspace = structuredClone(this.#state.workspace);
    const name = typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "New iOS policy";
    const policyPath = `policies/demo-${workspace.policies.length + 1}.json`;
    workspace.policies.push({ path: policyPath, document: { name, description: "Created in hosted demo memory.", platform: "IOS", versions: [{ name: "Draft", configurations: [] }] } });
    return this.commit(workspace, { policyPath });
  }

  private applyRemediation(): Response {
    const workspace = structuredClone(this.#state.workspace);
    const details = asRecord(targetConfiguration(workspace, { policyPath: workspace.policies[0]?.path, versionIndex: 0, configurationIndex: 1 })?.items[1])?.details;
    const record = asRecord(details);
    if (record !== undefined) record.allowAirDrop = false;
    this.#state = { ...this.#state, workspace, revision: this.nextRevision() };
    return reply(200, { ...workspaceReply(this.#state), report: demoComplianceReport(workspace) });
  }

  private commit(workspace: PolicyWorkspace, extra: Record<string, unknown> = {}): Response {
    this.#state = { ...this.#state, workspace, revision: this.nextRevision() };
    return reply(200, { ...workspaceReply(this.#state), ...extra });
  }

  private nextRevision(): string { this.#revision += 1; return `demo-r${this.#revision}`; }
}

export const demoApi = new DemoApi();
export function installDemoApi(): void { if (typeof window !== "undefined") window.fetch = demoApi.fetch.bind(demoApi); }

function workspaceReply(state: AppState) { return { workspace: structuredClone(state.workspace), validation: state.validation, sidecar: state.sidecar, revision: state.revision, keySet: false, keyValidated: false, keyValidationReason: state.keyValidationReason }; }
function denied(path: string): Response { return reply(403, { error: `Demo-only safety boundary: ${path} is unavailable. No archive, credentials, filesystem, network, or remote service is used.` }); }
function reply(status: number, value: unknown): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function demoOrigin(): string { return typeof window === "undefined" ? "https://demo.local" : window.location.origin; }
function requestUrl(input: RequestInfo | URL): URL { return new URL(input instanceof Request ? input.url : input.toString(), demoOrigin()); }
async function requestBody(input: RequestInfo | URL, init?: RequestInit): Promise<Record<string, unknown>> { const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined); if (typeof raw !== "string" || raw.length === 0) return {}; try { return asRecord(JSON.parse(raw)) ?? {}; } catch { return {}; } }
function asRecord(value: unknown): Record<string, unknown> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function isWorkspace(value: unknown): value is PolicyWorkspace { return Array.isArray(asRecord(value)?.policies); }
function targetConfiguration(workspace: PolicyWorkspace, body: Record<string, unknown>): { items: unknown[]; index: number } | undefined { const policyIndex = workspace.policies.findIndex((policy) => policy.path === body.policyPath); const versionIndex = typeof body.versionIndex === "number" ? body.versionIndex : 0; const index = typeof body.configurationIndex === "number" ? body.configurationIndex : 0; const version = asRecord(Array.isArray(workspace.policies[policyIndex]?.document.versions) ? workspace.policies[policyIndex]!.document.versions[versionIndex] : undefined); return Array.isArray(version?.configurations) ? { items: version.configurations, index } : undefined; }
function policyIndex(workspace: PolicyWorkspace, body: Record<string, unknown>): number { const target = asRecord(body.target); const index = typeof target?.policyPath === "string" ? workspace.policies.findIndex((policy) => policy.path === target.policyPath) : 0; return Math.max(0, index); }
function versionIndex(body: Record<string, unknown>): number { const target = asRecord(body.target); return typeof target?.versionIndex === "number" ? target.versionIndex : 0; }

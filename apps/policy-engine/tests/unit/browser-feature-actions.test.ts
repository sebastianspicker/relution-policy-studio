/** Verifies browser feature actions through fake same-origin ports, without a component harness. */
import assert from "node:assert/strict";
import test from "node:test";
import { buildArchive } from "../../web/src/features/artifacts/editor-build-action.js";
import { importArchive } from "../../web/src/features/artifacts/editor-archive-import-action.js";
import type { ImportBuildActionInput } from "../../web/src/shared/editor-import-build-contract.js";
import { createComplianceCheckAction } from "../../web/src/features/assurance/editor-compliance-check-action.js";
import type { ComplianceActionsInput } from "../../web/src/features/assurance/editor-compliance-action-runtime.js";
import { connectionTestFailureMessage, requestDashboardJson, requiredZammadTicket } from "../../web/src/features/external-audit/relution-dashboard-request.js";
import { WorkspaceRequestGuard } from "../../web/src/shared/editor-workspace-request-guard.js";
import type { AppState } from "../../web/src/shared/editor-contracts.js";
import type { ComplianceReport } from "../../src/browser/assurance.js";
import type { PolicyWorkspace } from "../../src/browser/workspace.js";

test("browser archive build persists dirty state before a verified build response becomes fresh", async () => {
  const calls: Array<{ readonly url: string; readonly body: unknown }> = [];
  await withBrowser(async (url, init) => {
    calls.push({ url: String(url), body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return jsonResponse({ outputFile: "/tmp/verified.rexp", sidecar: sidecarState(), verification: { ok: true } });
  }, async () => {
    const observed = actionObservations();
    const input = importBuildInput(observed, { isDirty: true });
    await buildArchive(input);
    assert.deepEqual(observed.persisted, [input.currentState.workspace]);
    assert.equal(observed.hasFreshBuild.at(-1), true);
    assert.deepEqual(observed.success, ["Built /tmp/verified.rexp"]);
    assert.equal(observed.buildLoading.at(-1), false);
  });
  assert.deepEqual(calls, [{ url: "http://editor.test/api/build", body: {} }]);
});

test("browser archive import publishes the returned workspace and resets local import state", async () => {
  const calls: Array<{ readonly url: string; readonly body: Record<string, unknown> }> = [];
  await withBrowser(async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    return jsonResponse({ workspace: workspace("Imported client archive"), validation: { ok: true, errors: [] }, sidecar: sidecarState(), revision: revision(), keySet: true, keyValidated: true });
  }, async () => {
    const observed = actionObservations();
    const input = importBuildInput(observed, { importFile: new File(["archive"], "policy.rexp"), keyValue: "archive-passphrase" });
    await importArchive(input);
    assert.equal(observed.state?.workspace.policies[0]!.document.name, "Imported client archive");
    assert.deepEqual(observed.isDirty, [false]);
    assert.deepEqual(observed.hasFreshBuild, [false]);
    assert.deepEqual(observed.historyCleared, ["undo", "redo"]);
    assert.deepEqual(observed.success, ["Imported policy.rexp"]);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "http://editor.test/api/import");
  assert.deepEqual(calls[0]!.body, { fileName: "policy.rexp", dataBase64: "YXJjaGl2ZQ==", key: "archive-passphrase", expectedRevision: revision() });
});

test("browser compliance check posts the selected target and commits only its returned report", async () => {
  const checkedReport = reportFor(workspace("Client compliance"));
  const calls: Array<{ readonly url: string; readonly body: unknown }> = [];
  await withBrowser(async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return jsonResponse({ report: checkedReport, revision: revision() });
  }, async () => {
    const observed = actionObservations();
    const state = appState(workspace("Client compliance"));
    const input = complianceInput(state, observed);
    await createComplianceCheckAction(input)();
    assert.deepEqual(observed.complianceReports, [{ report: checkedReport, workspace: state.workspace }]);
    assert.deepEqual(observed.success, ["Checked compliance"]);
    assert.equal(observed.complianceLoading.at(-1), false);
  });
  assert.deepEqual(calls, [{
    url: "http://editor.test/api/compliance/check",
    body: { expectedRevision: revision(), target: { policyPath: "policies/client.json", versionIndex: 0 }, sources: ["cis"] },
  }]);
});

test("browser external-audit request helpers preserve JSON errors and reject incomplete ticket identities", async () => {
  const calls: Array<{ readonly url: string; readonly body: unknown }> = [];
  await withBrowser(async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return jsonResponse({ connected: true });
  }, async () => {
    assert.deepEqual(await requestDashboardJson<{ readonly connected: boolean; readonly error?: string }>("/api/relution/test", { host: "https://relution.example.test" }), { connected: true });
  });
  assert.deepEqual(calls, [{ url: "http://editor.test/api/relution/test", body: { host: "https://relution.example.test" } }]);
  assert.equal(connectionTestFailureMessage({ ok: false, reason: "Refused" }), "Refused");
  assert.throws(() => requiredZammadTicket({ ticket: { id: Number.NaN, raw: {} } }), /no ticket id or number/u);
  assert.deepEqual(requiredZammadTicket({ ticket: { id: 42, title: "Created", raw: {} } }), { id: 42, title: "Created", raw: {} });
});

function workspace(name: string): PolicyWorkspace {
  return {
    metadata: {},
    policies: [{ path: "policies/client.json", document: { name, platform: "IOS", versions: [{ configurations: [{ uuid: "config-1", details: { type: "IOS_PASSCODE" } }] }] } }],
  } as unknown as PolicyWorkspace;
}

function sidecarState() {
  return { version: 1, mobileConfigRestore: [], ddmArtifacts: [], mdmCommandArtifacts: [], customManifests: [] };
}

function appState(value: PolicyWorkspace): AppState {
  return {
    revision: revision(),
    workspace: value,
    validation: { ok: true, errors: [] },
    outputFile: "/tmp/policy.rexp",
    sidecar: sidecarState(),
  } as unknown as AppState;
}

function revision(): string { return "a".repeat(64); }

function reportFor(value: PolicyWorkspace): ComplianceReport {
  return {
    policyPath: value.policies[0]!.path,
    policyName: String(value.policies[0]!.document.name),
    policyPlatform: "IOS",
    versionIndex: 0,
    sources: ["cis"],
    results: [],
    summary: { totalRecommendations: 0, byStatus: { compliant: 0, "exact-gap": 0, "choice-required": 0, "parameter-required": 0, "not-checkable": 0 } },
  };
}

type Observed = ReturnType<typeof actionObservations>;

function actionObservations() {
  const observed: {
    state: AppState | undefined;
    persisted: PolicyWorkspace[];
    hasFreshBuild: boolean[];
    buildLoading: boolean[];
    isDirty: boolean[];
    success: string[];
    errors: string[];
    historyCleared: string[];
    complianceLoading: boolean[];
    complianceReports: Array<{ readonly report: ComplianceReport; readonly workspace: PolicyWorkspace }>;
  } = { state: undefined, persisted: [], hasFreshBuild: [], buildLoading: [], isDirty: [], success: [], errors: [], historyCleared: [], complianceLoading: [], complianceReports: [] };
  return observed;
}

function importBuildInput(observed: Observed, overrides: Partial<Pick<ImportBuildActionInput, "isDirty" | "importFile" | "keyValue">> = {}): ImportBuildActionInput {
  const currentState = appState(workspace("Client workspace"));
  return {
    currentState,
    isDirty: overrides.isDirty ?? false,
    importFile: overrides.importFile,
    keyValue: overrides.keyValue ?? "",
    requestGuard: new WorkspaceRequestGuard(),
    persistWorkspace: async (value: PolicyWorkspace) => { observed.persisted.push(value); return value; },
    setState: (update: (current: AppState | undefined) => AppState | undefined) => { observed.state = update(currentState); },
    setIsDirty: (value: boolean) => { observed.isDirty.push(value); },
    setHasFreshBuild: (value: boolean) => { observed.hasFreshBuild.push(value); },
    setIsBuildLoading: (value: boolean) => { observed.buildLoading.push(value); },
    setSelectedType: () => undefined,
    setInspectorTab: () => undefined,
    setRulesetReport: () => undefined,
    setSelectedRecommendationId: () => undefined,
    setSelection: () => undefined,
    setActionSuccessStatus: (message: string) => { observed.success.push(message); },
    setActionErrorStatus: (message: string) => { observed.errors.push(message); },
    setLastActionResult: () => undefined,
    setStatus: () => undefined,
    historyInput: {
      setUndoStack: () => { observed.historyCleared.push("undo"); },
      setRedoStack: () => { observed.historyCleared.push("redo"); },
    },
  } as unknown as ImportBuildActionInput;
}

function complianceInput(currentState: AppState, observed: Observed): ComplianceActionsInput {
  return {
    currentState,
    selection: { policyIndex: 0, versionIndex: 0 },
    complianceSources: ["cis"],
    complianceReport: undefined,
    requestGuard: new WorkspaceRequestGuard(),
    setComplianceLoading: (value) => { observed.complianceLoading.push(value); },
    setComplianceError: () => undefined,
    setComplianceReportForWorkspace: (report, workspaceValue) => { observed.complianceReports.push({ report, workspace: workspaceValue }); },
    setActionSuccessStatus: (message) => { observed.success.push(message); },
    setActionErrorStatus: (message) => { observed.errors.push(message); },
    setLastActionResult: () => undefined,
    setStatus: () => undefined,
    setState: () => undefined,
    setIsDirty: () => undefined,
    setHasFreshBuild: () => undefined,
    historyInput: {} as ComplianceActionsInput["historyInput"],
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

async function withBrowser(
  fetchImpl: (url: string | URL, init?: RequestInit) => Promise<Response>,
  action: () => Promise<void>,
): Promise<void> {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const tokenStore = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "http://editor.test", hash: "", pathname: "/", search: "" },
      sessionStorage: { getItem: (key: string) => tokenStore.get(key) ?? null, setItem: (key: string, value: string) => tokenStore.set(key, value) },
      history: { replaceState: () => undefined },
      confirm: () => true,
      fetch: fetchImpl,
    },
  });
  try {
    await action();
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", previousWindow);
  }
}

/** Verifies that the Pages adapter is deterministic, in-memory, and network-denying. */
import assert from "node:assert/strict";
import test from "node:test";
import { DemoApi } from "../../web/src/demo/demo-api.js";

test("demo API serves known workbench routes from deterministic in-memory fixtures", async () => {
  const api = new DemoApi();
  const [state, recommendations, baseline] = await Promise.all([
    json(await api.fetch("https://demo.local/api/state")),
    json(await api.fetch("https://demo.local/api/recommendations")),
    json(await api.fetch("https://demo.local/api/baseline-templates")),
  ]);
  assert.equal(state.revision, "demo-r1");
  assert.equal(state.workspace.policies.length, 3);
  assert.equal(recommendations.sources[0].source, "bsi");
  assert.equal(baseline.options[0].platform, "IOS");
});

test("demo mutations update only adapter state and revisions reset deterministically", async () => {
  const api = new DemoApi();
  const initial = await json(await api.fetch("https://demo.local/api/state"));
  const workspace = structuredClone(initial.workspace);
  workspace.policies[0].document.name = "Edited only in memory";
  const saved = await json(await api.fetch("https://demo.local/api/workspace", {
    method: "POST",
    body: JSON.stringify({ workspace, expectedRevision: initial.revision }),
  }));
  assert.equal(saved.revision, "demo-r2");
  assert.equal((await json(await api.fetch("https://demo.local/api/state"))).workspace.policies[0].document.name, "Edited only in memory");
  api.reset();
  const reset = await json(await api.fetch("https://demo.local/api/state"));
  assert.equal(reset.revision, "demo-r1");
  assert.equal(reset.workspace.policies[0].document.name, "Executive iPhone baseline");
});

test("demo API denies unknown, archive, external, and cross-origin requests", async () => {
  const api = new DemoApi();
  for (const url of [
    "https://demo.local/api/build",
    "https://demo.local/api/relution/devices/audit",
    "https://demo.local/api/unknown",
    "https://service.example/api/state",
  ]) {
    assert.ok([403, 404].includes((await api.fetch(url, { method: "POST" })).status));
  }
});

async function json(response: Response): Promise<any> {
  return await response.json();
}

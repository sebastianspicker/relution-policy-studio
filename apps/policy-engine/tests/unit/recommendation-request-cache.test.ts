/** Shared request caches deduplicate and retain browsing, evidence and ruleset data independently. */
import assert from "node:assert/strict";
import test from "node:test";
import { loadRecommendationData, requestRecommendationData } from "../../web/src/shared/editor-recommendation-request.js";

test("concurrent and repeated navigation requests share promises; detail and import stay deferred", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => { requests.push(String(input)); return new Response(JSON.stringify({ url: String(input) })); };
  try {
    const browse = "/api/recommendations/test-cache/browse";
    const first = loadRecommendationData(browse);
    assert.equal(loadRecommendationData(browse), first);
    await first;
    await loadRecommendationData(browse);
    assert.deepEqual(requests, [browse]);
    for (const suffix of ["records/selected", "ruleset"]) {
      const path = `/api/recommendations/test-cache/${suffix}`;
      await Promise.all([loadRecommendationData(path), loadRecommendationData(path)]);
      await loadRecommendationData(path);
    }
    assert.equal(requests.length, 3);
  } finally { globalThis.fetch = original; }
});

test("failed requests can retry and an unmounted subscriber cannot publish stale state", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ ok: calls > 1 }), { status: calls === 1 ? 503 : 200 }); };
  try {
    const url = "/api/recommendations/test-retry/browse";
    await assert.rejects(loadRecommendationData(url));
    assert.deepEqual(await loadRecommendationData(url), { ok: true });
    let published = false;
    const cancel = requestRecommendationData(url, () => {}, () => {}, () => { published = true; });
    cancel();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(published, false);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("bundled import loads executable mappings only after intent and reuses them on repeat", async () => {
  const { createRulesetImportActions } = await import("../../web/src/features/artifacts/editor-ruleset-import-actions.js");
  const { demoRecommendationCatalog } = await import("../../web/src/demo/demo-data.js");
  const { browseRecommendationCatalog } = await import("../../src/assurance/recommendation-browse.js");
  const full = demoRecommendationCatalog("bsi");
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (url) => { requests.push(String(url)); return new Response(JSON.stringify(full.ruleset)); };
  try {
    const applied: unknown[] = [];
    const input = {
      recommendationCatalog: browseRecommendationCatalog(full), recommendationSource: "bsi", recommendationPlatform: "IOS", isDirty: false,
      requestGuard: { begin: () => ({}), isCurrent: () => true },
      setActionSuccessStatus: () => {}, setActionErrorStatus: (message: string) => assert.fail(message),
    } as unknown as Parameters<typeof createRulesetImportActions>[0];
    const actions = createRulesetImportActions(input, async (_name, ruleset) => { applied.push(ruleset); return "applied"; });
    assert.equal(requests.length, 0);
    await actions.importRecommendationRuleset();
    await actions.importRecommendationRuleset();
    assert.deepEqual(requests, ["/api/recommendations/bsi/ruleset"]);
    assert.equal(applied.length, 2);
    assert.deepEqual(applied[0], applied[1]);
  } finally { globalThis.fetch = original; }
});
